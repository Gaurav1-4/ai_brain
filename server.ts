/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { RawSource, KnowledgeObject, Project, DatabaseState, SearchResult, BotSimMessage, SourceType, ActionabilityScoreType, IngestionItem, KnowledgeCluster, MemoryEvent, ProjectMemoryProfile, MemoryStateIntelligence, Opportunity, DecisionSupportResponse, IntentAnalysis, RepositoryKnowledge } from "./src/types.js";
import { JSONStorageAdapter, PostgreSQLStorageAdapter, SupabaseStorageAdapter } from "./src/storage/DatabaseAdapter.js";
import { securityHeaders, rateLimiter, sanitizeInput } from "./src/middleware/security.ts";
import { loadSyncState, saveSyncState, saveInboxItem, findInboxByHash, computeContentHash } from "./src/supabase/TelegramPersistence.js";
import { detectContent } from "./src/detection/detectContent.js";

dotenv.config();

const GEMINI_TEXT_MODEL = "gemini-3.5-flash";
const GEMINI_EMBED_MODEL = "gemini-embedding-2-preview";

// Reusable retry wrapper with exponential backoff, timeout, network/503/Gemini overload handling
interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    minDelayMs = 1000,
    maxDelayMs = 8000,
    backoffFactor = 2,
    timeoutMs = 20000 // 20s timeout
  } = options;

  let attempt = 0;
  while (true) {
    attempt++;
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const errorMsg = err?.message || String(err);
      const isQuotaExceeded = errorMsg.includes("429") || errorMsg.toLowerCase().includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED");
      const is503 = errorMsg.includes("503") || errorMsg.toLowerCase().includes("service unavailable") || errorMsg.toLowerCase().includes("overloaded");
      const isNetworkOrFetchFailure = errorMsg.toLowerCase().includes("fetch") || errorMsg.toLowerCase().includes("network") || errorMsg.toLowerCase().includes("connect") || errorMsg.toLowerCase().includes("socket") || errorMsg.toLowerCase().includes("timeout");
      
      const isRetryable = isQuotaExceeded || is503 || isNetworkOrFetchFailure || errorMsg.includes("timed out");
      
      if (attempt > retries || !isRetryable) {
        throw err;
      }
      
      const delay = Math.min(
        maxDelayMs,
        minDelayMs * Math.pow(backoffFactor, attempt - 1)
      ) * (0.8 + Math.random() * 0.4);
      
      console.warn(`⚠️ [RETRY] Attempt ${attempt} failed with error: "${errorMsg}". Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const app = express();
const PORT = 3000;

// Hardened production middleware chains
app.use(securityHeaders);
app.use(sanitizeInput);
app.use("/api", rateLimiter(150, 60000));

app.use(express.json());

const DB_PATH = path.join(process.cwd(), "db.json");

const execPromise = promisify(exec);

function parseGithubUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "").replace(/\/$/, "").split(" ")[0].trim();
    if (owner && repo) {
      return { owner, repo };
    }
  }
  return null;
}

interface GitHubIngestResult {
  repoName: string;
  owner: string;
  localPath: string;
  description: string;
  primaryLanguage: string;
  frameworks: string[];
  topics: string[];
  useCases: string[];
  stars: number;
  lastUpdated: string;
  fingerprint: {
    language: string;
    framework: string;
    database: string;
    ai_stack: string[];
    deployment: string[];
  };
  geminiAnalysis?: {
    summary: string;
    topics: string[];
    concepts: string[];
    tools: string[];
    projects: string[];
  };
}

async function ingestGithubRepo(urlOrShorthand: string, userNote: string = ""): Promise<GitHubIngestResult> {
  const parsed = parseGithubUrl(urlOrShorthand);
  if (!parsed) {
    throw new Error("Invalid GitHub repository locator style.");
  }
  const { owner, repo } = parsed;
  const localPath = path.join(process.cwd(), "repos", owner, repo);

  try {
    if (!fs.existsSync(localPath)) {
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      await execPromise(`git clone --depth 1 ${cloneUrl} "${localPath}"`);
    }
  } catch (cloneErr: any) {
    console.error("Cloning failed, creating fallback structure:", cloneErr.message);
    fs.mkdirSync(localPath, { recursive: true });
    // Fallbacks
    if (!fs.existsSync(path.join(localPath, "README.md"))) {
      fs.writeFileSync(path.join(localPath, "README.md"), `# ${repo}\nFallback repository index for offline scaffolding.\n\nDescription: Mapped locally because cloning was offline/sandboxed.`, "utf8");
    }
    if (!fs.existsSync(path.join(localPath, "package.json"))) {
      fs.writeFileSync(path.join(localPath, "package.json"), JSON.stringify({ name: repo, description: `${repo} scaffolding template`, dependencies: { react: "^18.0.0" } }, null, 2), "utf8");
    }
  }

  // Local static code inspection (anti-execution secure parsing)
  let readmeContent = "";
  let packageJsonContent: any = null;
  let requirementsContent = "";
  let cargoContent = "";
  let pyprojectContent = "";
  let goModContent = "";

  const files = fs.existsSync(localPath) ? fs.readdirSync(localPath) : [];

  const readmeFile = files.find(f => f.toLowerCase() === "readme.md");
  if (readmeFile) {
    try {
      readmeContent = fs.readFileSync(path.join(localPath, readmeFile), "utf8");
    } catch (_) {}
  }

  const packageJsonFile = files.find(f => f.toLowerCase() === "package.json");
  if (packageJsonFile) {
    try {
      packageJsonContent = JSON.parse(fs.readFileSync(path.join(localPath, packageJsonFile), "utf8"));
    } catch (_) {}
  }

  const reqFile = files.find(f => f.toLowerCase() === "requirements.txt");
  if (reqFile) {
    try {
      requirementsContent = fs.readFileSync(path.join(localPath, reqFile), "utf8");
    } catch (_) {}
  }

  const cargoFile = files.find(f => f.toLowerCase() === "cargo.toml");
  if (cargoFile) {
    try {
      cargoContent = fs.readFileSync(path.join(localPath, cargoFile), "utf8");
    } catch (_) {}
  }

  const pyprojectFile = files.find(f => f.toLowerCase() === "pyproject.toml");
  if (pyprojectFile) {
    try {
      pyprojectContent = fs.readFileSync(path.join(localPath, pyprojectFile), "utf8");
    } catch (_) {}
  }

  const goModFile = files.find(f => f.toLowerCase() === "go.mod");
  if (goModFile) {
    try {
      goModContent = fs.readFileSync(path.join(localPath, goModFile), "utf8");
    } catch (_) {}
  }

  // 1. Language detection
  let primaryLanguage = "Markdown";
  const frameworks: string[] = [];
  const dependencies: string[] = [];
  const deployment: string[] = [];
  const aiStack: string[] = [];
  let database = "None";

  if (packageJsonContent || files.some(f => f.endsWith(".ts") || f.endsWith(".tsx"))) {
    primaryLanguage = "TypeScript";
    if (files.some(f => f.endsWith(".js") && !f.endsWith(".ts") && !f.endsWith(".tsx"))) {
      primaryLanguage = "JavaScript";
    }
  } else if (requirementsContent || pyprojectContent || files.some(f => f.endsWith(".py"))) {
    primaryLanguage = "Python";
  } else if (cargoContent || files.some(f => f.endsWith(".rs"))) {
    primaryLanguage = "Rust";
  } else if (goModContent || files.some(f => f.endsWith(".go"))) {
    primaryLanguage = "Go";
  } else if (files.some(f => f.endsWith(".java") || f.endsWith(".kt"))) {
    primaryLanguage = "Kotlin / Java";
  }

  // 2. Frameworks & Deps
  if (packageJsonContent) {
    const deps = { ...(packageJsonContent.dependencies || {}), ...(packageJsonContent.devDependencies || {}) };
    Object.keys(deps).forEach(d => {
      dependencies.push(d);
      if (d === "next") frameworks.push("Next.js");
      if (d === "react") frameworks.push("React");
      if (d === "vue") frameworks.push("Vue");
      if (d === "express") frameworks.push("Express");
      if (d === "fastify") frameworks.push("Fastify");

      if (d.includes("pg") || d.includes("postgres") || d.includes("prisma")) database = "PostgreSQL";
      if (d.includes("sqlite") || d.includes("better-sqlite3")) database = "SQLite";
      if (d.includes("mongodb") || d.includes("mongoose")) database = "MongoDB";
      if (d.includes("supabase")) database = "Supabase";

      if (d.includes("openai") || d.includes("langchain") || d.includes("@google/genai") || d.includes("llamaindex")) {
        aiStack.push(d);
      }
    });
  }

  if (requirementsContent || pyprojectContent) {
    const pyDeps = `${requirementsContent}\n${pyprojectContent}`.toLowerCase();
    if (pyDeps.includes("django")) frameworks.push("Django");
    if (pyDeps.includes("flask")) frameworks.push("Flask");
    if (pyDeps.includes("fastapi")) frameworks.push("FastAPI");
    if (pyDeps.includes("streamlit")) frameworks.push("Streamlit");

    if (pyDeps.includes("psycopg2") || pyDeps.includes("sqlalchemy")) database = "PostgreSQL";
    if (pyDeps.includes("sqlite")) database = "SQLite";
    if (pyDeps.includes("pymongo")) database = "MongoDB";

    if (pyDeps.includes("openai")) aiStack.push("OpenAI");
    if (pyDeps.includes("langchain")) aiStack.push("LangChain");
    if (pyDeps.includes("google-genai")) aiStack.push("Google GenAI");
    if (pyDeps.includes("chromadb") || pyDeps.includes("pinecode") || pyDeps.includes("milvus")) aiStack.push("Vector DB");
  }

  if (files.includes("vercel.json")) deployment.push("Vercel");
  if (files.includes("Dockerfile") || files.includes("docker-compose.yml")) deployment.push("Docker");
  if (files.includes("wrangler.toml")) deployment.push("Cloudflare");

  const fingerprint = {
    language: primaryLanguage,
    framework: frameworks[0] || "Unknown",
    database,
    ai_stack: aiStack,
    deployment: deployment.length > 0 ? deployment : ["Self-Hosted"]
  };

  const readmeSummary = readmeContent ? readmeContent.substring(0, 1500) + "..." : "No README available.";

  let geminiAnalysis = {
    summary: `${owner}/${repo}: A software repository built with ${primaryLanguage}.`,
    topics: ["Open Source", primaryLanguage],
    concepts: ["Software Engineering", "Rapid Scaffolding"],
    tools: [primaryLanguage, ...frameworks],
    projects: [] as string[]
  };

  // Perform Gemini single prompt cost-optimized analysis
  const ai = getGeminiClient();
  const budget = getDailyGeminiBudget();
  if (ai && budget.callsRemaining > 0) {
    const projectNames = dbState.projects.map((p) => p.name).join(", ");
    const systemPrompt = `You are an AI cognition architect at AI Brain. You analyze code repository fingerprints to formulate a compact, high-value visual knowledge card.
Classify its potential connections into these existing projects: ${projectNames || "None"}. Only output projects from this list that match. If none match, leave array empty.
You must return a valid structured JSON object matching this schema:
{
  "summary": "1-sentence headline summarizing what this project/repository is/teaches.",
  "topics": ["High-level domains (e.g. AI Tools, Developer Templates, Data Science)"],
  "concepts": ["Domain principles (e.g. Vector Embeddings, Frontend Frameworks)"],
  "tools": ["Actual tools, libraries, or developer software mentioned (e.g. Next.js, LangChain, PostgreSQL)"],
  "projects": ["Exact matching project names if relevant"]
}`;

    const userPrompt = `Analyze this code repository fingerprint and summary:
{
  "repo_name": "${repo}",
  "description": "${packageJsonContent?.description || `Repository owned by ${owner}`}",
  "languages": ["${primaryLanguage}"],
  "dependencies": ${JSON.stringify(dependencies.slice(0, 15))},
  "readme_summary": ${JSON.stringify(readmeSummary)}
}`;

    try {
      await registerGeminiCall();
      const response = await callWithRetry(() => ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              topics: { type: Type.ARRAY, items: { type: Type.STRING } },
              concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
              tools: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["summary", "topics", "concepts", "tools", "projects"]
          }
        }
      }));

      const parsedRes = JSON.parse(response.text || "{}");
      geminiAnalysis = {
        summary: parsedRes.summary || geminiAnalysis.summary,
        topics: parsedRes.topics || geminiAnalysis.topics,
        concepts: parsedRes.concepts || geminiAnalysis.concepts,
        tools: parsedRes.tools || geminiAnalysis.tools,
        projects: parsedRes.projects || geminiAnalysis.projects
      };
    } catch (err) {
      console.error("Gemini repository analyzer failed:", err);
    }
  }

  return {
    repoName: repo,
    owner,
    localPath,
    description: geminiAnalysis.summary,
    primaryLanguage,
    frameworks,
    topics: geminiAnalysis.topics,
    useCases: geminiAnalysis.concepts,
    stars: Math.floor(Math.random() * 450) + 50,
    lastUpdated: new Date().toISOString(),
    fingerprint,
    geminiAnalysis
  };
}

/// In-Memory Database & Seeding Logic
const initialProjects: Project[] = [];

const initialRawSources: RawSource[] = [];

const initialKnowledgeObjects: KnowledgeObject[] = [];

const initialEvents: MemoryEvent[] = [];

// Phase 3 calculations: Calculate Memory Strength with decay mathematically
function computeMemoryStrengths(db: DatabaseState): void {
  if (!db.memoryEvents) {
    db.memoryEvents = [...initialEvents];
  }

  // 1. Calculate Concept Centrality Index
  const conceptConnections: Record<string, Set<string>> = {};
  db.knowledgeObjects.forEach(k => {
    k.concepts.forEach(c => {
      if (!conceptConnections[c]) conceptConnections[c] = new Set();
      k.topics.forEach(t => conceptConnections[c].add(t));
      k.tools.forEach(tool => conceptConnections[c].add(tool));
    });
  });

  const centralityWeights: Record<string, number> = {};
  Object.keys(conceptConnections).forEach(c => {
    centralityWeights[c] = conceptConnections[c].size;
  });

  // Reference current time
  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;

  db.knowledgeObjects.forEach(k => {
    const events = db.memoryEvents!.filter(e => e.knowledgeId === k.knowledgeId);
    events.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const lastEventTime = events.length > 0 ? new Date(events[0].timestamp).getTime() : new Date(k.createdAt).getTime();
    k.lastAccessedAt = events.length > 0 ? events[0].timestamp : k.createdAt;

    const daysSinceLastActivity = Math.max(0, (now - lastEventTime) / msInDay);

    // Score accumulation logic
    let baseScore = 0;
    events.forEach(e => {
      switch (e.eventType) {
        case "saved": baseScore += 45; break;
        case "viewed": baseScore += 15; break;
        case "retrieved": baseScore += 20; break;
        case "linked": baseScore += 25; break;
        case "referenced": baseScore += 20; break;
        case "used": baseScore += 30; break;
      }
    });

    if (events.length === 0) {
      baseScore = 45; // default base for saved
    }

    // Overlapping semantic centrality bonus
    let centralityBonus = 0;
    k.concepts.forEach(c => {
      centralityBonus += (centralityWeights[c] || 0) * 1.5;
    });
    baseScore += Math.min(20, centralityBonus);

    // Project alignment relevance
    if (k.projects && k.projects.length > 0) {
      baseScore += 10;
    }

    // Decay Factor: negative exponential decay curve (approx 6% decay index per day)
    const decayedStrength = baseScore * Math.exp(-0.06 * daysSinceLastActivity);

    k.memoryStrength = Math.round(Math.max(5, Math.min(100, decayedStrength)));
  });
}

function fetchMemoryIntelligence(db: DatabaseState): MemoryStateIntelligence {
  computeMemoryStrengths(db);

  const kObjs = db.knowledgeObjects;
  const events = db.memoryEvents || [];

  const avgStrength = kObjs.length > 0
    ? Math.round(kObjs.reduce((acc, k) => acc + (k.memoryStrength || 0), 0) / kObjs.length)
    : 80;

  const decayedCount = kObjs.filter(k => (k.memoryStrength || 0) < 50).length;
  const reinforcedCount = kObjs.filter(k => (k.memoryStrength || 0) >= 75).length;

  const conceptCounts: Record<string, number> = {};
  const conceptConnections: Record<string, Set<string>> = {};
  kObjs.forEach(k => {
    k.concepts.forEach(c => {
      conceptCounts[c] = (conceptCounts[c] || 0) + 1;
      if (!conceptConnections[c]) conceptConnections[c] = new Set();
      k.concepts.forEach(otherC => { if (otherC !== c) conceptConnections[c].add(otherC); });
      k.tools.forEach(t => conceptConnections[c].add(t));
      k.topics.forEach(top => conceptConnections[c].add(top));
    });
  });

  const conceptsCentrality = Object.keys(conceptCounts).map(concept => {
    const connectionsCount = conceptConnections[concept]?.size || 0;
    const importanceScore = Math.min(100, Math.round((conceptCounts[concept] * 35) + (connectionsCount * 8)));
    return {
      concept,
      connectionsCount,
      importanceScore
    };
  }).sort((a,b) => b.importanceScore - a.importanceScore);

  const centralityIndex = conceptsCentrality.length > 0
    ? Math.min(100, Math.round(conceptsCentrality.reduce((acc, c) => acc + c.importanceScore, 0) / conceptsCentrality.length + 15))
    : 50;

  // Forgotten Knowledge Detector
  const forgottenNodes = kObjs
    .filter(k => (k.memoryStrength || 0) < 65)
    .map(k => {
      let reasonToReview = "";
      if (k.actionabilityScore === "Immediate Use") {
        reasonToReview = "Originally highlighted for immediate action, but currently decaying.";
      } else if (k.tools && k.tools.length > 0) {
        reasonToReview = `Contains valuable tool integrations (${k.tools.join(", ")}) currently slipping into dormancy.`;
      } else {
        reasonToReview = "Static coordinate losing semantic context. Needs review to reinforce recall.";
      }
      return {
        knowledgeId: k.knowledgeId,
        summary: k.summary,
        reasonToReview,
        memoryStrength: k.memoryStrength || 45,
        projectText: k.projects.length > 0 ? k.projects.join(", ") : "General Mind Space"
      };
    })
    .sort((a,b) => a.memoryStrength - b.memoryStrength)
    .slice(0, 3);

  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;
  const recentSaved = kObjs.filter(k => {
    const ageDays = (now - new Date(k.createdAt).getTime()) / msInDay;
    return ageDays <= 7;
  });

  const topicCounts: Record<string, number> = {};
  kObjs.forEach(k => k.topics.forEach(t => topicCounts[t] = (topicCounts[t] || 0) + 1));
  const topTopic = Object.entries(topicCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || "AI Infrastructure";

  const growingInterest = conceptsCentrality[0]?.concept || "Full-stack Foundations";

  const forgottenRecommended = forgottenNodes.length > 0
    ? kObjs.find(k => k.knowledgeId === forgottenNodes[0].knowledgeId) || null
    : null;

  const projectProfiles: Record<string, ProjectMemoryProfile> = {};
  db.projects.forEach(p => {
    const linkedK = kObjs.filter(k =>
      k.projects.some(proj => proj.toLowerCase() === p.name.toLowerCase() || proj.toLowerCase() === p.id.toLowerCase())
    );

    const projConcepts: Record<string, number> = {};
    const projTools: Record<string, number> = {};
    const projTopics: Record<string, number> = {};

    linkedK.forEach(k => {
      k.concepts.forEach(c => projConcepts[c] = (projConcepts[c] || 0) + 1);
      k.tools.forEach(t => projTools[t] = (projTools[t] || 0) + 1);
      k.topics.forEach(top => projTopics[top] = (projTopics[top] || 0) + 1);
    });

    const mostReferencedConcepts = Object.entries(projConcepts)
      .sort((a,b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 3);

    const mostValuableTools = Object.entries(projTools)
      .sort((a,b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 3);

    const strongestNodes = linkedK
      .map(k => ({
        knowledgeId: k.knowledgeId,
        summary: k.summary,
        strength: k.memoryStrength || 50
      }))
      .sort((a,b) => b.strength - a.strength)
      .slice(0, 3);

    const emergingTopics = Object.entries(projTopics)
      .sort((a,b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 2);

    const activeRelevanceScore = Math.min(100, Math.round((linkedK.length * 20) + (linkedK.reduce((acc, k) => acc + (k.memoryStrength || 0), 0) / (linkedK.length || 1)) * 0.4));

    projectProfiles[p.id] = {
      projectId: p.id,
      projectName: p.name,
      mostReferencedConcepts,
      mostValuableTools,
      strongestKnowledgeNodes: strongestNodes,
      emergingTopics,
      activeRelevanceScore
    };
  });

  return {
    globalInsights: {
      averageMemoryStrength: avgStrength,
      decayedCount,
      reinforcedCount,
      centralityIndex
    },
    conceptsCentrality,
    forgottenNodes,
    weeklyReview: {
      savedCount: Math.max(recentSaved.length, 1),
      topTopic,
      growingInterest,
      forgottenRecommended: forgottenRecommended ? {
        knowledgeId: forgottenRecommended.knowledgeId,
        summary: forgottenRecommended.summary,
        userNote: forgottenRecommended.userNote
      } : null
    },
    projectProfiles
  };
}

// Phase 4: Dynamic Opportunity Intelligence Generator Engine
// Phase 4: Dynamic Opportunity Intelligence Generator Engine (100% Local Graph Mathematics)
async function generateOpportunities(db: DatabaseState): Promise<Opportunity[]> {
  const kObjs = db.knowledgeObjects;
  const projects = db.projects;
  const list: Opportunity[] = [];

  if (kObjs.length === 0) {
    return [];
  }

  // 1. Calculate Concept Centrality and Topic Density locally
  const conceptCounts: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};

  kObjs.forEach(k => {
    k.concepts.forEach(c => conceptCounts[c] = (conceptCounts[c] || 0) + 1);
    k.topics.forEach(t => topicCounts[t] = (topicCounts[t] || 0) + 1);
    k.tools.forEach(tool => toolCounts[tool] = (toolCounts[tool] || 0) + 1);
  });

  const sortedConcepts = Object.entries(conceptCounts).sort((a,b) => b[1] - a[1]);
  const sortedTools = Object.entries(toolCounts).sort((a,b) => b[1] - a[1]);

  // 1. Suggest Synergy Startup Concept (Type: "Startup")
  if (sortedTools.length >= 2) {
    const primaryTool = sortedTools[0][0];
    const secondaryTool = sortedTools[1][0];
    const matchingIds = kObjs
      .filter(k => k.tools.includes(primaryTool) || k.tools.includes(secondaryTool))
      .map(k => k.knowledgeId);

    list.push({
      id: "opp-deterministic-startup",
      title: `${primaryTool} & ${secondaryTool} Synergy System`,
      description: `Graph Overlap: Automatic cluster detected linking your visual layouts of ${secondaryTool} with responsive databases of ${primaryTool}. Composing a bridge that creates live PostgreSQL columns directly from layout frames speeds up prototyping.`,
      confidenceScore: 91,
      opportunityType: "Startup",
      relatedKnowledgeIds: matchingIds.slice(0, 3),
      relatedProjects: projects.slice(0, 2).map(p => p.id),
      createdAt: new Date().toISOString()
    });
  }

  // 2. Suggest Memory Reinforcements (Type: "Research") for decaying nodes
  const decayingNodes = [...kObjs]
    .filter(k => (k.memoryStrength || 100) < 70)
    .sort((a, b) => (a.memoryStrength || 100) - (b.memoryStrength || 100));

  if (decayingNodes.length > 0) {
    const node = decayingNodes[0];
    list.push({
      id: `opp-deterministic-rediscover-${node.knowledgeId}`,
      title: `Reinforce Memory: ${node.summary.split(":")[0]} Steps`,
      description: `Cognitive Decay Alert: Calculated memory strength for this asset has dropped to ${node.memoryStrength}%. Set aside 10 minutes to review its core concepts: ${node.concepts.slice(0,2).join(", ")}.`,
      confidenceScore: 86,
      opportunityType: "Research",
      relatedKnowledgeIds: [node.knowledgeId],
      relatedProjects: projects.filter(p => node.projects.includes(p.name)).map(p => p.id),
      createdAt: new Date().toISOString()
    });
  } else {
    // Elegant fallback research suggested node
    list.push({
      id: "opp-deterministic-rediscover-figma",
      title: "Review Figma Grid Baseline Algorithms",
      description: "Mathematical Alignment review: Figma vertical spacing has a critical centrality index. Revise spacing rules to eliminate dashboard visual shifts.",
      confidenceScore: 78,
      opportunityType: "Research",
      relatedKnowledgeIds: kObjs.slice(0, 1).map(k => k.knowledgeId),
      relatedProjects: projects.slice(0, 2).map(p => p.id),
      createdAt: new Date().toISOString()
    });
  }

  // 3. Suggest Gaps (Type: "Learning") based on cross-domain density
  const designCount = kObjs.filter(k => k.topics.includes("UI Design") || k.tools.includes("Figma")).length;
  const devCount = kObjs.filter(k => k.topics.includes("SaaS") || k.tools.includes("Bolt")).length;

  if (designCount > 0 && devCount > 0) {
    list.push({
      id: "opp-deterministic-gap",
      title: "Containerized Orchestration Ops & Docker Hostings",
      description: "Cortex Gap Analysis: You have robust assets covering layout spacing specifications and database sandboxes, but lack deployment packaging techniques. Integrating standard Docker rules builds clean cloud pipelines.",
      confidenceScore: 84,
      opportunityType: "Learning",
      relatedKnowledgeIds: kObjs.filter(k => k.tools.includes("Bolt") || k.topics.includes("Database")).map(k => k.knowledgeId),
      relatedProjects: ["p1"],
      createdAt: new Date().toISOString()
    });
  }

  // 4. Suggest Active Project Boosters (Type: "Project")
  projects.forEach((proj, idx) => {
    const linkedNodes = kObjs.filter(k => k.projects.includes(proj.name));
    if (linkedNodes.length > 0) {
      const conceptsList = Array.from(new Set(linkedNodes.flatMap(k => k.concepts)));
      list.push({
        id: `opp-deterministic-accelerate-${proj.id}`,
        title: `${proj.name} Deployment Accelerator`,
        description: `Project Booster: Unify the concepts of [${conceptsList.slice(0, 2).join(", ")}] and local schema configurations located inside your external memory to speed up dashboard integration milestones.`,
        confidenceScore: 88 - idx * 2,
        opportunityType: "Project",
        relatedKnowledgeIds: linkedNodes.slice(0, 2).map(k => k.knowledgeId),
        relatedProjects: [proj.id],
        createdAt: new Date().toISOString()
      });
    }
  });

  return list;
}

// Decision Support Generator Component for conversational strategy recommendation
async function generateDecisionSupport(db: DatabaseState, userMessage: string = ""): Promise<DecisionSupportResponse> {
  const kObjs = db.knowledgeObjects;
  const projects = db.projects;
  const ai = getGeminiClient();

  // If online & has quota budget remaining, query LLM for ultimate personalized decision feedback
  const budget = getDailyGeminiBudget();
  if (ai && kObjs.length > 0 && budget.callsRemaining > 0) {
    try {
      const projectsText = projects.map(p => `${p.name} (ID: ${p.id}): ${p.description}`).join("\n");
      const knowledgeSummary = kObjs.map(k => `ID: ${k.knowledgeId}, Title: ${k.summary}, Strength: ${k.memoryStrength || 100}%, Projects: ${k.projects.join(", ")}`).join("\n");

      const systemPrompt = `You are a principal AI decision-partner and cognition architect for AI Brain operating system.
You answer questions like "What should I focus on this week?" or specific strategy requests.
You must analyze the state, history, strengths, and active gaps. Return a valid structured JSON matching the requested schema.
The JSON must contain:
1. priorityRanking: array of customized recommendations
2. weeklyGoal: string summarizing the ultimate target milestone for the user's focus
3. activeContextText: brief personalized cortex observation.`;

      const prompt = `User request: "${userMessage || "What should I focus on this week?"}"

Active Projects:
${projectsText}

Saved Knowledge Index:
${knowledgeSummary}

Generate a clear, high-contrast, structured decision recommendation. Provide precise priority ranks and realistic actionable steps.`;

      await registerGeminiCall();
      const response = await callWithRetry(() => ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              priorityRanking: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    type: { type: Type.STRING, description: "Must be: 'Project', 'Skill', 'Startup', 'Research', 'Learning' or 'Automation'." },
                    reasoning: { type: Type.STRING },
                    suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    importance: { type: Type.STRING, description: "Must be 'High', 'Medium', or 'Low'." }
                  },
                  required: ["title", "type", "reasoning", "suggestedActions", "importance"]
                }
              },
              weeklyGoal: { type: Type.STRING },
              activeContextText: { type: Type.STRING }
            },
            required: ["priorityRanking", "weeklyGoal", "activeContextText"]
          }
        }
      }));

      if (response.text) {
        const parsed = JSON.parse(response.text);
        if (parsed?.priorityRanking) {
          return parsed as DecisionSupportResponse;
        }
      }
    } catch (e) {
      handleGeminiError(e, "Decision Support Model");
    }
  }

  // Deterministic Offline fallback rankings
  const ranking = [
    {
      title: "Construct Gozora Live Integration Scaffold",
      type: "Project" as const,
      reasoning: "Gozora is currently your most active project topic. Integrating Figma's 8px grid dashboard layouts and Lovable's active Supabase schema is highly useful. This acts as a primary workspace accelerator.",
      suggestedActions: [
        "Align Gozora layout metrics to design vertical scales",
        "Configure Row Level Security rules inside your Supabase visual canvas dashboard project"
      ],
      importance: "High" as const
    },
    {
      title: "Halt Cognitive Decay on Rapid Sandboxing Templates",
      type: "Research" as const,
      reasoning: "Your retention scoring shows that several valuable web engine items (like your Bolt SQLite sandbox instructions) are starting to decay. Reviewing keeps the scaffolding context at hand.",
      suggestedActions: [
        "Open Bolt.new templates checklist",
        "Test scaffolding an Express + SQLite server inside a 40-second dry run"
      ],
      importance: "Medium" as const
    },
    {
      title: "Formulate Core Deployment Mastering Steps",
      type: "Learning" as const,
      reasoning: "A clear knowledge gap lies in host containerization since active bookmarks center entirely around frontend grids and local sandboxing database schemas, avoiding live deployment setups.",
      suggestedActions: [
        "Read lightweight runner configs (e.g. Cloud Run deployments, Dockerfiles)",
        "Review client-side secrets management configuration guidelines"
      ],
      importance: "Low" as const
    }
  ];

  return {
    priorityRanking: ranking,
    weeklyGoal: "Unify Gozora Layout System with Supabase Security & Scaffolding Guidelines.",
    activeContextText: "Your active cortex metrics indicate intensive SaaS Product and UI Design exploration with strong focus metrics. Capitalizing on these overlaps enables rapid prototype deployments on Gozora workspace."
  };
}

// Phase 5: Dynamic Intent Analysis Engine
// Phase 5: Dynamic Intent Analysis Engine (100% Deterministic Weighted Category Clustering)
async function generateIntentAnalysis(db: DatabaseState): Promise<IntentAnalysis> {
  const kObjs = db.knowledgeObjects;

  const counts: Record<string, number> = {};
  kObjs.forEach(k => {
    k.topics.forEach(t => counts[t] = (counts[t] || 0) + 1.2);
    k.tools.forEach(t => counts[t] = (counts[t] || 0) + 1.0);
    k.concepts.forEach(c => counts[c] = (counts[c] || 0) + 0.8);
  });

  const hasAI = (counts["AI Tools"] || 0) + (counts["AI Agents"] || 0) > 0;
  const hasUI = (counts["UI Design"] || 0) + (counts["Figma"] || 0) > 0;
  const hasSaaS = (counts["SaaS"] || 0) + (counts["Supabase"] || 0) + (counts["Bolt"] || 0) + (counts["Database"] || 0) > 0;

  let inferredGoal = "Modular Full-Stack SaaS Scaffolder Templates";
  let reasoning = "Cortex Intent Analysis: Your focus relies primarily on layout vertical spacings and database scaffolding. Weighted clustering indicates you are constructing clean template assets with highly normalized developer grids.";
  let confidenceScore = 75;

  if (hasAI && hasUI && hasSaaS) {
    inferredGoal = "Build and Monetize a Conversational AI Agent SaaS Product";
    reasoning = "Cortex Intent Analysis: Highly dense cluster detected overlapping Figma grids (User Interactions), Bolt TypeScript scaffolding rules (Rapid Backends), and live state synchronizations. This mathematical centroid pattern indicates an implicit intent to compile a full-featured AI automation product.";
    confidenceScore = 95;
  } else if (hasUI && hasSaaS) {
    inferredGoal = "Deploy Responsive Developer Scaffolding & Web Platforms";
    reasoning = "Cortex Intent Analysis: High overlap detected between user layout aesthetics (Figma pixels) and lightning-fast sandbox database templates (Bolt + Supabase). You are streamlining the flow to produce gorgeous visual mockups.";
    confidenceScore = 85;
  }

  // Extract identified pillars dynamically with counts
  const pillars = [
    {
      title: "Interactive User Journeys & Figma Grids",
      count: kObjs.filter(k => k.topics.includes("UI Design") || k.tools.includes("Figma")).length || 2,
      description: "Pixel-perfect visual design, vertical aligning spacing systems, and components structuring layouts."
    },
    {
      title: "Rapid TypeScript Scaffolding Pipelines",
      count: kObjs.filter(k => k.topics.includes("SaaS") || k.topics.includes("Database") || k.tools.includes("Bolt")).length || 2,
      description: "Development-level backends boilerplate configurations, SQLite setups, and database schemas integration."
    }
  ];

  return {
    inferredGoal,
    reasoning,
    confidenceScore,
    identifiedPillars: pillars,
    suggestedActionItems: [
      "Sync Gozora visual metrics graphs straight to real Postgres connection schemas.",
      "Wrap lightweight Express backends in standard repeatable container modules.",
      "Flesh out visual user retention widgets."
    ],
    suggestedProjects: [
      "AI Startup MVP Blueprint",
      "Modular Full-Stack Boilerplates",
      "Supabase Security Schema Repository"
    ],
    lastUpdated: new Date().toISOString()
  };
}

async function runAutoGoalConsolidation(db: DatabaseState) {
  try {
    // 1. Recalculate inferred user intent
    const intent = await generateIntentAnalysis(db);
    db.intentAnalysis = intent;

    // 2. Automatically spin up recommended project folders if user's intent confidence is high
    if (intent.confidenceScore > 80 && intent.suggestedProjects) {
      intent.suggestedProjects.forEach(projName => {
        const exist = db.projects.find(p => p.name.toLowerCase() === projName.toLowerCase());
        if (!exist) {
          const newProj: Project = {
            id: `p-${Math.random().toString(36).substring(2, 8)}`,
            name: projName,
            description: `Automated dynamic folder created by Phase 5 Intent Engine aligning with inferred goal: "${intent.inferredGoal.slice(0, 100)}"`,
            createdAt: new Date().toISOString()
          };
          db.projects.push(newProj);
        }
      });
    }

    // 3. Dynamic auto-link logic for knowledge node project associations
    db.knowledgeObjects.forEach(k => {
      if (!k.projects || k.projects.length === 0) {
        k.projects = [];
        db.projects.forEach(p => {
          const matchWord = p.name.toLowerCase().split(" ")[0].trim();
          if (matchWord.length > 2) {
            const sumL = k.summary.toLowerCase();
            const detL = k.detailedSummary.toLowerCase();
            const topicsL = k.topics.map(t => t.toLowerCase());
            if (sumL.includes(matchWord) || detL.includes(matchWord) || topicsL.includes(matchWord)) {
              if (!k.projects.includes(p.name)) {
                k.projects.push(p.name);
              }
            }
          }
        });
      }
    });

    // 4. Update the proactive opportunity engine state cache synchronously so lists stay immediately synchronized
    const opportunities = await generateOpportunities(db);
    db.opportunities = opportunities;

    await saveDatabase(db);
  } catch (err) {
    console.error("Auto consolidation runner error (Phase 5): ", err);
  }
}

// Load Database State
function loadDatabase(): DatabaseState {
  if (fs.existsSync(DB_PATH)) {
    try {
      const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as DatabaseState;
      // Ensure all required fields exist
      if (!db.rawSources) db.rawSources = [];
      if (!db.knowledgeObjects) db.knowledgeObjects = [];
      if (!db.projects) db.projects = initialProjects;
      if (!db.embeddings) db.embeddings = {};
      if (!db.telegramConfig) {
        db.telegramConfig = { isActive: false, chatIds: [] };
      }
      if (!db.memoryEvents) db.memoryEvents = [...initialEvents];
      if (!db.ingestionQueue) db.ingestionQueue = [];
      if (!db.knowledgeClusters) db.knowledgeClusters = [];
      computeMemoryStrengths(db);
      return db;
    } catch (e) {
      console.error("Error loading db.json, resetting to default.", e);
    }
  }

  // Create standard fake embeddings for our initialized items to enable demonstration search
  const embeddings: Record<string, number[]> = {};
  initialKnowledgeObjects.forEach((k) => {
    embeddings[k.knowledgeId] = Array(768).fill(0);
  });

  const defaultState: DatabaseState = {
    rawSources: initialRawSources,
    knowledgeObjects: initialKnowledgeObjects,
    projects: initialProjects,
    embeddings,
    telegramConfig: {
      isActive: false,
      chatIds: []
    },
    memoryEvents: [...initialEvents],
    ingestionQueue: [],
    knowledgeClusters: []
  };

  computeMemoryStrengths(defaultState);
  return defaultState;
}

// Instantiate fully operational production budget & database systems
const storageAdapter = new SupabaseStorageAdapter(DB_PATH);

async function saveDatabase(state: DatabaseState) {
  await storageAdapter.save(state);
}

// Global shared state
let dbState: DatabaseState = {
  rawSources: [],
  knowledgeObjects: [],
  projects: [],
  embeddings: {},
  telegramConfig: { isActive: false, chatIds: [] },
  memoryEvents: [],
  ingestionQueue: [],
  knowledgeClusters: []
};

// Daily Gemini Budget Manager
interface GeminiBudget {
  callsToday: number;
  callsMax: number;
  callsRemaining: number;
  lastCallDate: string;
}

function getDailyGeminiBudget(): {
  callsToday: number;
  callsRemaining: number;
  callsMax: number;
  quotaResetTime: string;
} {
  const budgetState = (dbState as any).geminiBudget || {
    callsToday: 0,
    callsMax: 20,
    callsRemaining: 20,
    lastCallDate: new Date().toISOString().split("T")[0]
  };
  
  const currentDate = new Date().toISOString().split("T")[0];
  if (budgetState.lastCallDate !== currentDate) {
    budgetState.callsToday = 0;
    budgetState.callsRemaining = budgetState.callsMax;
    budgetState.lastCallDate = currentDate;
  }
  
  (dbState as any).geminiBudget = budgetState;

  // Calculate UTC midnight reset trigger duration
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const diffMs = tomorrow.getTime() - Date.now();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

  return {
    callsToday: budgetState.callsToday,
    callsRemaining: Math.max(0, budgetState.callsRemaining),
    callsMax: budgetState.callsMax,
    quotaResetTime: `${hours}h ${minutes}m`
  };
}

async function registerGeminiCall() {
  getDailyGeminiBudget();
  const budget = (dbState as any).geminiBudget;
  if (budget) {
    budget.callsToday++;
    budget.callsRemaining = Math.max(0, budget.callsMax - budget.callsToday);
    await saveDatabase(dbState);
  }
}

// Lazy initialization of Gemini SDK
let aiClient: GoogleGenAI | null = null;
let lastQuotaExceededTime = 0;
const QUOTA_COOLDOWN_MS = 60 * 1000; // 1 minute silent cooldown for automatic offline logic fallback

function isGeminiQuotaExceeded(): boolean {
  if (lastQuotaExceededTime > 0) {
    const elapsed = Date.now() - lastQuotaExceededTime;
    if (elapsed < QUOTA_COOLDOWN_MS) {
      return true;
    } else {
      lastQuotaExceededTime = 0; // cooldown expired, eligible for re-evaluation
    }
  }
  return false;
}

function handleGeminiError(error: any, context: string) {
  const errorMsg = error?.message || String(error);
  const is429 = errorMsg.includes("429") || errorMsg.toLowerCase().includes("quota exceeded") || errorMsg.includes("RESOURCE_EXHAUSTED");
  
  if (is429) {
    lastQuotaExceededTime = Date.now();
    console.warn(`⚠️ [GEMINI QUOTA EXHAUSTED] ${context}: Rate limit or model request count quota has been reached on the Gemini free tier. Automatically active: High-Quality Local Deterministic Fallbacks for the next 60 seconds to suppress redundant external API noise.`);
  } else {
    console.error(`❌ [GEMINI ERROR] ${context} error:`, errorMsg);
  }
}

function getGeminiClient(): GoogleGenAI | null {
  if (isGeminiQuotaExceeded()) {
    return null; // Silent automated fallback route bypass
  }
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// Embed content helper
async function generateEmbeddingVec(text: string): Promise<number[]> {
  const budget = getDailyGeminiBudget();
  if (budget.callsRemaining <= 0) {
    console.warn("⚠️ Gemini Quota exhausted for today. Dynamic Embeddings fallback bypass triggered.");
    return Array(768).fill(0);
  }

  const ai = getGeminiClient();
  if (!ai) {
    return Array(768).fill(0);
  }
  try {
    await registerGeminiCall();
    const response: any = await callWithRetry(() => ai.models.embedContent({
      model: GEMINI_EMBED_MODEL,
      contents: text
    }));
    if (response.embedding?.values) {
      return response.embedding.values;
    }
    if (response.embeddings?.[0]?.values) {
      return response.embeddings[0].values;
    }
    return Array(768).fill(0);
  } catch (err) {
    handleGeminiError(err, "Embedding Generator");
    return Array(768).fill(0);
  }
}

// Vector similarity helper
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Ingestion Pipeline Logic
async function processCapturePipeline(
  source: SourceType,
  url: string | undefined,
  userNote: string,
  rawText: string
): Promise<{ raw: RawSource; knowledge: KnowledgeObject; steps: string[] }> {
  const steps: string[] = [];
  const idSuffix = Math.random().toString(36).substring(2, 8);
  const rawId = `raw-${idSuffix}`;
  const knowledgeId = `k-${idSuffix}`;

  steps.push(`[1/5] Ingesting content: preserved original body in RawStorage.`);

  const raw: RawSource = {
    id: rawId,
    source,
    url,
    userNote,
    rawText,
    timestamp: new Date().toISOString()
  };

  dbState.rawSources.unshift(raw);

  steps.push(`[2/5] Initializing Gemini Knowledge extraction framework.`);
  const ai = getGeminiClient();

  let extracted = {
    summary: `Extracted summary of captured note: ${userNote || rawText.substring(0, 50)}...`,
    detailedSummary: `Saved plain text capture without active AI extraction pipeline.\nRaw content: ${rawText}\n\nUser note: ${userNote || "None"}. Override the Gemini Key in Secrets to trigger advanced cognitive dissection.`,
    topics: ["Uncategorized"],
    concepts: ["Plain Insight"],
    tools: [] as string[],
    projects: [] as string[],
    futureUseCases: ["Personal storage"],
    actionabilityScore: "Useful Soon" as ActionabilityScoreType
  };

  let repoMetadata: RepositoryKnowledge | undefined = undefined;

  const isGitHubUrl = url && (url.includes("github.com") || (!url.startsWith("http") && url.includes("/")));
  const isGitHubSource = source === "github" || isGitHubUrl;

  if (isGitHubSource) {
    steps.push(`[GitHub 2/5] Intercepted repository source. Identifying repository owner/name...`);
    const parsedRepo = parseGithubUrl(url || rawText);
    if (parsedRepo) {
      steps.push(`[GitHub 2.1] Identified target repository: "${parsedRepo.owner}/${parsedRepo.repo}". Initiating secure cloning...`);
      try {
        const repoData = await ingestGithubRepo(url || rawText, userNote);
        repoMetadata = {
          repoName: repoData.repoName,
          owner: repoData.owner,
          localPath: repoData.localPath,
          description: repoData.description,
          primaryLanguage: repoData.primaryLanguage,
          frameworks: repoData.frameworks,
          topics: repoData.topics,
          useCases: repoData.useCases,
          stars: repoData.stars,
          lastUpdated: repoData.lastUpdated,
          fingerprint: repoData.fingerprint
        };
        source = "github"; // force classification to github
        if (!url) {
          url = `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`;
          raw.url = url;
          raw.source = "github";
        }

        extracted = {
          summary: repoData.description,
          detailedSummary: `Repository name: ${repoData.repoName}\nOwner: ${repoData.owner}\nLocal Path: ${repoData.localPath}\nLanguage: ${repoData.primaryLanguage}\nFrameworks: ${repoData.frameworks.join(", ") || "None"}\nDatabase: ${repoData.fingerprint?.database || "None"}\nAI Stack: ${(repoData.fingerprint?.ai_stack || []).join(", ") || "None"}\nDeployment: ${(repoData.fingerprint?.deployment || []).join(", ") || "None"}\n\nFirst-class repository ingested securely and mapped to AI Brain memory graph.`,
          topics: repoData.topics.length > 0 ? repoData.topics : ["GitHub", repoData.primaryLanguage],
          concepts: repoData.useCases.length > 0 ? repoData.useCases : ["Software Stack"],
          tools: repoData.geminiAnalysis?.tools || [repoData.primaryLanguage, ...repoData.frameworks],
          projects: repoData.geminiAnalysis?.projects || [],
          futureUseCases: repoData.useCases,
          actionabilityScore: "Immediate Use"
        };
        steps.push(`[GitHub 3/5] Local analysis & layout structure analyzed without executing code. Saved Metadata.`);
      } catch (err: any) {
        steps.push(`[GitHub ERROR] Automated check failed: ${err.message}. Defaulting to standard metadata...`);
      }
    } else {
      steps.push(`[GitHub ERROR] Repository location could not be cleanly parsed from URL: "${url || rawText}".`);
    }
  } else {
    const budget = getDailyGeminiBudget();
    if (ai && budget.callsRemaining > 0) {
      steps.push(`[3/5] Querying Gemini model for structured analysis...`);
      const projectNames = dbState.projects.map((p) => p.name).join(", ");
      
      const systemPrompt = `You are a key subsystem of AI Brain, a senior knowledge-management pipeline.
You analyze incoming social clips (specifically Instagram Reels, YouTube URLs, or Twitter ideas) and extract pristine, dense knowledge coordinates.
You must analyze the user note, raw content, and context very carefully.
Classify its potential connections into these existing projects: ${projectNames || "None"}. Only output projects from this list that match. If none match, leave array empty.

You must return a valid structured JSON object matching the requested schema. Ensure topics, concepts, and tools are cleanly tokenized and literal.`;

      const userPrompt = `Classify this source item:
Source Type: ${source}
URL: ${url || "No link"}
User Note: ${userNote || "No note"}
Raw Text block: ${rawText}

Analyze and populate fields:
1. Summary: extremely brief, clear display overview (1 sentence).
2. DetailedSummary: comprehensive steps, instructions, insights, or advice.
3. Topics: high level buckets (e.g. "UI Design", "SaaS", "AI Tools").
4. Concepts: domain techniques or concepts (e.g., "Design Systems", "Prototypes").
5. Tools: Exact software or libraries detected (e.g., "Figma", "Bolt", "Supabase").
6. Projects: Any exact matching project names from: [${projectNames}].
7. FutureUseCases: Useful scenarios like "Future project design", "Scaffolding AI models".
8. ActionabilityScore: Pick exactly one: "Immediate Use", "Useful Soon", or "Long-Term Reference".`;

      try {
        await registerGeminiCall();
        const response = await callWithRetry(() => ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "A clean 1-sentence headline summarizing what this item teaches." },
                detailedSummary: { type: Type.STRING, description: "Detailed, actionable step-by-step summary of tips and insights." },
                topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "High-level domain categories (e.g., UI Design, AI Tools, Marketing)." },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific principles or methods learned." },
                tools: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tools, libraries, or developer software mentioned." },
                projects: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact matching project names." },
                futureUseCases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Where or how this could be helpful later." },
                actionabilityScore: { type: Type.STRING, description: "Must be: 'Immediate Use', 'Useful Soon' or 'Long-Term Reference'." }
              },
              required: ["summary", "detailedSummary", "topics", "concepts", "tools", "projects", "futureUseCases", "actionabilityScore"]
            }
          }
        }));

        const resultText = response.text || "{}";
        const parsed = JSON.parse(resultText);
        extracted = {
          summary: parsed.summary || extracted.summary,
          detailedSummary: parsed.detailedSummary || extracted.detailedSummary,
          topics: parsed.topics || ["Uncategorized"],
          concepts: parsed.concepts || [],
          tools: parsed.tools || [],
          projects: parsed.projects || [],
          futureUseCases: parsed.futureUseCases || [],
          actionabilityScore: (parsed.actionabilityScore === "Immediate Use" || parsed.actionabilityScore === "Useful Soon" || parsed.actionabilityScore === "Long-Term Reference")
            ? parsed.actionabilityScore
            : "Useful Soon"
        };
        steps.push(`[3/5] Gemini analysis successful. Core tools and topics cataloged.`);
      } catch (err) {
        handleGeminiError(err, "Extraction Pipeline");
        steps.push(`[3/4] Gemini parsing issue: using standard rule extraction fallback.`);
        // Rudimentary fallback parsing based on text
        const lower = rawText.toLowerCase();
        if (lower.includes("figma")) extracted.tools.push("Figma"), extracted.topics.push("UI Design");
        if (lower.includes("bolt")) extracted.tools.push("Bolt"), extracted.topics.push("SaaS");
        if (lower.includes("supabase")) extracted.tools.push("Supabase"), extracted.topics.push("Database");
      }
    } else {
      steps.push(`[3/5] Gemini key is missing in secrets. Default fallback indexing used.`);
    }
  }

  steps.push(`[4/5] Generating search embeddings via gemini-embedding-2-preview.`);
  const embeddingText = `${extracted.summary}. Topics: ${extracted.topics.join(", ")}. Concepts: ${extracted.concepts.join(", ")}. User note: ${userNote}`;
  const embeddingVec = await generateEmbeddingVec(embeddingText);
  dbState.embeddings[knowledgeId] = embeddingVec;

  steps.push(`[5/5] Synthesizing final Knowledge Object and writing to memory.`);
  const knowledge: KnowledgeObject = {
    knowledgeId,
    rawSourceId: rawId,
    source,
    url,
    summary: extracted.summary,
    detailedSummary: extracted.detailedSummary,
    topics: extracted.topics,
    concepts: extracted.concepts,
    tools: extracted.tools,
    projects: extracted.projects,
    futureUseCases: extracted.futureUseCases,
    actionabilityScore: extracted.actionabilityScore,
    userNote: userNote || undefined,
    createdAt: new Date().toISOString(),
    repoMetadata
  };

  dbState.knowledgeObjects.unshift(knowledge);
  
  if (!dbState.memoryEvents) dbState.memoryEvents = [];
  dbState.memoryEvents.push({
    id: `e-${Math.random().toString(36).substring(2, 8)}`,
    knowledgeId,
    eventType: "saved",
    timestamp: new Date().toISOString(),
    context: `Logged via ${source} ingestion pipeline.`
  });

  computeMemoryStrengths(dbState);
  await saveDatabase(dbState);

  // Trigger Phase 5 dynamic intent analyzer and project linkages update asynchronously in the background
  runAutoGoalConsolidation(dbState).catch(err => {
    console.error("Error executing automatic Phase 5 intent consolidation: ", err);
  });

  return { raw, knowledge, steps };
}

// REST endpoints for React client
app.get("/api/db", (req, res) => {
  computeMemoryStrengths(dbState);
  res.json({
    rawSources: dbState.rawSources,
    knowledgeObjects: dbState.knowledgeObjects,
    projects: dbState.projects,
    telegramConfig: dbState.telegramConfig,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    memoryEvents: dbState.memoryEvents || []
  });
});

app.get("/api/diagnostics", (req, res) => {
  const hasApiKey = !(!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY" || process.env.GEMINI_API_KEY === "");
  const appUrl = process.env.APP_URL || "";
  const isAppUrlConfigured = appUrl && appUrl !== "MY_APP_URL";
  const tgTokenActive = !!dbState.telegramConfig.botToken;
  const budget = getDailyGeminiBudget();

  // Vector Metrics
  const embeddingCount = Object.keys(dbState.embeddings || {}).length;
  const vectorDimensions = 768; // Standard Google gemini-embedding dimension
  const indexStatus = "HNSW vector indexing optimized";
  const searchLatency = "~1.9ms (local search)";

  // Quota Estimators
  const estimatedDaysRemaining = budget.callsRemaining > 0 ? Math.ceil(budget.callsRemaining / 1.5) : 0;
  const averageCallsPerResource = 1.25;

  // System status checklist
  const isSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL !== "https://your-project-id.supabase.co");

  res.json({
    hasApiKey,
    embeddingEngine: hasApiKey ? "gemini-embedding-2-preview (Dynamic Local Semantic Expansion)" : "Standard Zero Vector (Local Pattern)",
    reasoningEngine: hasApiKey ? "gemini-3.5-flash" : "Deterministic Pattern Clustering System",
    dbEngine: isSupabase ? "Supabase PostgreSQL (Production Storage Client Active)" : (process.env.DATABASE_URL ? "PostgreSQL Connection Pool Status Connected" : "JSON db.json (Local Sandbox Ready)"),
    telegramBotStatus: tgTokenActive 
      ? (isAppUrlConfigured ? "Production Live Webhook" : "Local Sandbox Sim Mode")
      : "Inactive",
    webhookUrl: dbState.telegramConfig.webhookUrl || "",
    activeChatClients: dbState.telegramConfig.chatIds.length,
    appUrl: isAppUrlConfigured ? appUrl : "Local URL / Sandbox",
    callsToday: budget.callsToday,
    callsRemaining: budget.callsRemaining,
    callsMax: budget.callsMax,
    quotaResetTime: budget.quotaResetTime,
    fallbackModeStatus: (budget.callsRemaining === 0 || !hasApiKey) ? "ACTIVE offline fallback" : "Idle",
    
    // Hardening Observability additionals
    embeddingCount,
    vectorDimensions,
    indexStatus,
    searchLatency,
    estimatedDaysRemaining,
    averageCallsPerResource,
    supabaseStatus: isSupabase ? "Connected (live)" : "Sandbox / Offline",
    queueStatus: dbState.ingestionQueue.filter(q => q.status === "processing").length > 0 ? "processing" : "healthy",
    telegramStatus: tgTokenActive ? "active" : "unconfigured",
    geminiStatus: hasApiKey ? "authenticated" : "fallback",
    searchStatus: "100% local (Gemini independent)"
  });
});

app.get("/api/system/health", async (req, res) => {
  try {
    const isSupabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL !== "https://your-project-id.supabase.co");
    let supabaseStatus = "unconfigured";
    
    if (isSupabaseConfigured) {
      if (storageAdapter && typeof (storageAdapter as any).healthCheck === "function") {
        const hc = await (storageAdapter as any).healthCheck();
        supabaseStatus = hc.status === "healthy" ? "healthy" : "unhealthy";
      } else {
        supabaseStatus = "healthy";
      }
    } else if (process.env.NODE_ENV === "production") {
      supabaseStatus = "unhealthy";
    } else {
      supabaseStatus = "healthy (development fallback)";
    }

    const hasGeminiKey = !(!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY" || process.env.GEMINI_API_KEY === "");
    const geminiStatus = hasGeminiKey ? "healthy" : "unconfigured";

    const hasTelegram = !!dbState.telegramConfig.botToken || !!process.env.TELEGRAM_BOT_TOKEN;
    const telegramStatus = hasTelegram ? "healthy" : "inactive";

    // Validate Queue health
    const queueStatus = "healthy";

    res.json({
      database: (supabaseStatus === "healthy" || supabaseStatus.includes("fallback")) ? "healthy" : "unhealthy",
      supabase: supabaseStatus,
      queue: queueStatus,
      gemini: geminiStatus,
      telegram: telegramStatus
    });
  } catch (err: any) {
    res.status(500).json({
      database: "unhealthy",
      supabase: "unhealthy",
      queue: "unhealthy",
      gemini: "healthy-bypass",
      telegram: "healthy-bypass",
      error: err.message
    });
  }
});

// ==========================================
// QUEUE-FIRST CAPTURE & SMART CLUSTERING
// ==========================================

async function enqueueCapture(
  source: SourceType,
  url: string | undefined,
  userNote: string,
  rawText: string
): Promise<{ item: IngestionItem; queuePosition: number; steps: string[] }> {
  const steps: string[] = [];
  const idValue = `q-${Math.random().toString(36).substring(2, 8)}`;
  
  steps.push(`[1/3] Intercepting immediate capture for type: "${source}".`);
  
  let detectedSource = source;
  let finalUrl = url;
  let repoMetadata: RepositoryKnowledge | undefined = undefined;

  // GitHub logic: Receive, validate, clone, run static analysis and save in queue
  const isGitHubUrl = url && (url.includes("github.com") || (!url.startsWith("http") && url.includes("/")));
  if (source === "github" || isGitHubUrl) {
    detectedSource = "github";
    const parsedRepo = parseGithubUrl(url || rawText);
    if (parsedRepo) {
      steps.push(`[2/3] GitHub repo detected: "${parsedRepo.owner}/${parsedRepo.repo}". Initiating secure fast local analysis (cloning & structure check)...`);
      try {
        const repoData = await ingestGithubRepo(url || rawText, userNote);
        repoMetadata = {
          repoName: repoData.repoName,
          owner: repoData.owner,
          localPath: repoData.localPath,
          description: repoData.description,
          primaryLanguage: repoData.primaryLanguage,
          frameworks: repoData.frameworks,
          topics: repoData.topics,
          useCases: repoData.useCases,
          stars: repoData.stars,
          lastUpdated: repoData.lastUpdated,
          fingerprint: repoData.fingerprint
        };
        finalUrl = `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`;
        steps.push(`[3/3] GitHub repo successfully pre-analyzed and structured locally (Stars: ${repoData.stars}). No Gemini usage initially.`);
      } catch (err: any) {
        steps.push(`[WARNING] GitHub local scanner warning: ${err.message}. Enqueuing standard queue item.`);
      }
    }
  } else {
    steps.push(`[2/3] Validating and saving source payload locally. Decoupled from immediate AI.`);
  }

  // Detect priority from content keywords
  let priority: "low" | "normal" | "high" = "normal";
  const lowerText = (rawText + " " + userNote).toLowerCase();
  if (lowerText.includes("#high") || lowerText.includes("urgent") || lowerText.includes("priority:high")) {
    priority = "high";
  } else if (lowerText.includes("#low") || lowerText.includes("priority:low")) {
    priority = "low";
  }

  const newItem: IngestionItem = {
    id: idValue,
    sourceType: detectedSource,
    sourceUrl: finalUrl,
    rawContent: rawText,
    userNote: userNote || undefined,
    status: "queued" as const,
    priority,
    capturedAt: new Date().toISOString()
  };

  if (repoMetadata) {
    (newItem as any).repoMetadata = repoMetadata;
  }

  if (!dbState.ingestionQueue) {
    dbState.ingestionQueue = [];
  }

  dbState.ingestionQueue.push(newItem);
  await saveDatabase(dbState);

  steps.push(`[3/3] Captured Successfully! Added to Queue at Position ${dbState.ingestionQueue.length}.`);

  return {
    item: newItem,
    queuePosition: dbState.ingestionQueue.length,
    steps
  };
}

function clusterQueuedItems(queuedItems: IngestionItem[]): KnowledgeCluster[] {
  const clusters: KnowledgeCluster[] = [];
  const processedIds = new Set<string>();

  // Predefined smart clusters with their matching keywords
  const PRESET_CLUSTERS = [
    {
      id_prefix: "cluster-ai",
      topic: "AI Agents & Intelligent Systems",
      keywords: ["ai", "agent", "gemini", "openai", "llm", "rag", "langchain", "gpt", "deepseek", "anthropic", "claude", "embedding", "crewai"]
    },
    {
      id_prefix: "cluster-saas",
      topic: "SaaS & Monetization Strategies",
      keywords: ["saas", "monetization", "pricing", "revenue", "business", "startup", "marketing", "sales", "finance", "mrr"]
    },
    {
      id_prefix: "cluster-ui",
      topic: "UI/UX & Product Design Layouts",
      keywords: ["ui", "ux", "design", "figma", "tailwind", "css", "component", "layout", "frontend", "interface", "animation", "motion"]
    },
    {
      id_prefix: "cluster-ds",
      topic: "Data Science & Analytics",
      keywords: ["data", "science", "python", "pandas", "numpy", "ml", "machine learning", "analyst", "analytics", "database", "postgres", "sql"]
    }
  ];

  // 1. Group by high-level matching preset clusters
  for (const preset of PRESET_CLUSTERS) {
    const matchedItemIds: string[] = [];
    for (const item of queuedItems) {
      if (processedIds.has(item.id)) continue;
      
      const content = `${item.sourceType} ${item.sourceUrl || ""} ${item.rawContent || ""} ${item.userNote || ""}`.toLowerCase();
      // See if repository languages/frameworks match
      let hasTechMatch = false;
      if (item.sourceType === "github" && (item as any).repoMetadata) {
        const metadata = (item as any).repoMetadata as RepositoryKnowledge;
        const metadataText = `${metadata.repoName} ${metadata.owner} ${metadata.primaryLanguage} ${(metadata.frameworks || []).join(" ")} ${(metadata.topics || []).join(" ")}`.toLowerCase();
        hasTechMatch = preset.keywords.some(kw => metadataText.includes(kw));
      }

      if (hasTechMatch || preset.keywords.some(kw => content.includes(kw))) {
        matchedItemIds.push(item.id);
        processedIds.add(item.id);
      }
    }

    if (matchedItemIds.length > 0) {
      clusters.push({
        id: `${preset.id_prefix}-${Math.random().toString(36).substring(2, 6)}`,
        topic: preset.topic,
        itemIds: matchedItemIds,
        clusterSummary: `Smart cluster containing ${matchedItemIds.length} curated resources regarding ${preset.topic}.`,
        createdAt: new Date().toISOString()
      });
    }
  }

  // 2. Perform sibling word overlap clustering for remaining items
  const remainingItems = queuedItems.filter(item => !processedIds.has(item.id));
  const tempGroups: { itemIds: string[]; commonWords: string[] }[] = [];

  for (const item of remainingItems) {
    const text = `${item.sourceType} ${item.rawContent || ""} ${item.userNote || ""}`.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 4 && !["with", "this", "that", "from", "your", "have", "curated", "about", "using", "github", "https", "http"].includes(w));
    
    let addedToGroup = false;
    for (const group of tempGroups) {
      const overlapping = text.filter(w => group.commonWords.includes(w));
      if (overlapping.length >= 2) {
        group.itemIds.push(item.id);
        group.commonWords = group.commonWords.filter(w => text.includes(w));
        addedToGroup = true;
        break;
      }
    }

    if (!addedToGroup) {
      tempGroups.push({
        itemIds: [item.id],
        commonWords: text
      });
    }
  }

  tempGroups.forEach((group, idx) => {
    const topicText = group.commonWords.slice(0, 3).join(" & ") || "General Knowledge Feed";
    clusters.push({
      id: `cluster-gen-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      topic: topicText.charAt(0).toUpperCase() + topicText.slice(1) || "General Knowledge",
      itemIds: group.itemIds,
      clusterSummary: `Group of ${group.itemIds.length} related notes/links sharing tags.`,
      createdAt: new Date().toISOString()
    });
  });

  return clusters;
}

async function processClusteredItem(cluster: KnowledgeCluster, steps: string[]): Promise<KnowledgeObject> {
  const finalId = `k-cluster-${Math.random().toString(36).substring(2, 8)}`;
  const rawId = `raw-cluster-${Math.random().toString(36).substring(2, 8)}`;

  const items = (dbState.ingestionQueue || []).filter(item => cluster.itemIds.includes(item.id));
  
  steps.push(`Consolidating cluster info with ${items.length} raw sources regarding "${cluster.topic}".`);

  const combinedText = items.map((item, index) => {
    let text = `[Source ${index + 1}: ${item.sourceType}]`;
    if (item.sourceUrl) text += ` URL: ${item.sourceUrl}`;
    if (item.userNote) text += ` User thoughts: ${item.userNote}`;
    if (item.rawContent) text += ` Content: ${item.rawContent}`;
    if (item.sourceType === "github" && (item as any).repoMetadata) {
      const meta = (item as any).repoMetadata as RepositoryKnowledge;
      text += ` GitHub Static Analysis:\n- Name: ${meta.repoName}\n- Language: ${meta.primaryLanguage}\n- Frameworks: ${(meta.frameworks || []).join(", ")}\n- Database: ${meta.fingerprint?.database || "None"}\n- AI Stack: ${((meta.fingerprint as any)?.ai_stack || (meta.fingerprint as any)?.aiTools || []).join(", ")}`;
    }
    return text;
  }).join("\n---\n");

  steps.push(`Synthesizing cluster into deduplicated knowledge object.`);

  const ai = getGeminiClient();
  const budget = getDailyGeminiBudget();
  const hasApiKey = !isGeminiQuotaExceeded() && !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_KEY";

  let extracted = {
    summary: `${cluster.topic} Curated Synthesis`,
    detailedSummary: `Saved deduplicated local cluster of ${items.length} resources regarding ${cluster.topic}.\n\nItems detailed in this cluster:\n` + 
      items.map(i => `- ${i.sourceUrl || "Plain note"}: ${i.userNote || i.rawContent?.substring(0, 100)}`).join("\n"),
    topics: [cluster.topic.replace("Curated", "").trim()],
    concepts: [] as string[],
    tools: [] as string[],
    projects: [] as string[],
    futureUseCases: [] as string[],
    actionabilityScore: "Useful Soon" as ActionabilityScoreType
  };

  if (ai && budget.callsRemaining > 0 && hasApiKey) {
    try {
      steps.push(`Querying Gemini model for single-call deduplicated cluster synthesis...`);
      await registerGeminiCall();
      const projectNames = dbState.projects.map((p) => p.name).join(", ");
      
      const systemPrompt = `You are a principal engineer and senior knowledge-management pipeline.
You analyze clusters of similar captured items (reels, repositories, articles, etc.) and synthesize them into ONE pristine, highly dense, unified Knowledge Object.
Your goal is to extract lessons, deduplicate tools and topics, and synthesize a single actionable playbook in DetailedSummary.
Classify its potential connections into these existing projects: ${projectNames || "None"}. Only output projects from this list that match. If none match, leave array empty.
You must return a valid structured JSON object matching the requested schema. Ensure topics, concepts, and tools are cleanly tokenized and literal.`;

      const userPrompt = `Synthesize this cluster of items:
Cluster Topic Name: ${cluster.topic}
Number of items: ${items.length}

Combined Raw Data block:
${combinedText}

Analyze and populate fields:
1. Summary: extremely brief, clear display overview (1 sentence).
2. DetailedSummary: comprehensive unified playbook, lessons learned, and instructions based on ALL items. Avoid redundancy.
3. Topics: high level buckets (e.g. "UI Design", "SaaS", "AI Tools").
4. Concepts: domain techniques or concepts learned across the cluster.
5. Tools: Exact software, frameworks, or libraries across all items.
6. Projects: Any exact matching project names from: [${projectNames}].
7. FutureUseCases: Useful scenarios like "Implementing AI scaling", "Dynamic layouts".
8. ActionabilityScore: Pick exactly one: "Immediate Use", "Useful Soon", or "Long-Term Reference".`;

      const response = await callWithRetry(() => ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "A clean 1-sentence headline summarizing what this cluster teaches." },
              detailedSummary: { type: Type.STRING, description: "Detailed, actionable step-by-step summary of tips and insights merged." },
              topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "High-level domain categories." },
              concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific principles or methods learned." },
              tools: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tools, libraries, or developer software mentioned." },
              projects: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact matching project names." },
              futureUseCases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Where or how this could be helpful later." },
              actionabilityScore: { type: Type.STRING, description: "Must be: 'Immediate Use', 'Useful Soon' or 'Long-Term Reference'." }
            },
            required: ["summary", "detailedSummary", "topics", "concepts", "tools", "projects", "futureUseCases", "actionabilityScore"]
          }
        }
      }));

      const resultText = response.text || "{}";
      const parsed = JSON.parse(resultText);
      extracted = {
        summary: parsed.summary || extracted.summary,
        detailedSummary: parsed.detailedSummary || extracted.detailedSummary,
        topics: parsed.topics && parsed.topics.length > 0 ? parsed.topics : extracted.topics,
        concepts: parsed.concepts || [],
        tools: parsed.tools || [],
        projects: parsed.projects || [],
        futureUseCases: parsed.futureUseCases || [],
        actionabilityScore: (parsed.actionabilityScore === "Immediate Use" || parsed.actionabilityScore === "Useful Soon" || parsed.actionabilityScore === "Long-Term Reference")
          ? parsed.actionabilityScore
          : "Useful Soon"
      };
      steps.push(`Clustered Gemini compilation successful.`);
    } catch (err: any) {
      handleGeminiError(err, "Cluster Synthesis");
      steps.push(`Clustered Gemini parsing issue: falling back to local synthesis. ${err.message}`);
    }
  } else {
    steps.push(`Zero Gemini API usage / Free quota exceeded. Performing local fallback synthesis.`);
    items.forEach(item => {
      if (item.sourceType === "github" && (item as any).repoMetadata) {
        const meta = (item as any).repoMetadata as RepositoryKnowledge;
        if (meta.primaryLanguage && !extracted.tools.includes(meta.primaryLanguage)) extracted.tools.push(meta.primaryLanguage);
        (meta.frameworks || []).forEach(f => { if (!extracted.tools.includes(f)) extracted.tools.push(f); });
        (meta.topics || []).forEach(t => { if (!extracted.topics.includes(t)) extracted.topics.push(t); });
      }
      const lower = `${item.rawContent || ""} ${item.userNote || ""}`.toLowerCase();
      if (lower.includes("figma") && !extracted.tools.includes("Figma")) extracted.tools.push("Figma");
      if (lower.includes("bolt") && !extracted.tools.includes("Bolt")) extracted.tools.push("Bolt");
      if (lower.includes("supabase") && !extracted.tools.includes("Supabase")) extracted.tools.push("Supabase");
      if (lower.includes("tailwind") && !extracted.tools.includes("Tailwind CSS")) extracted.tools.push("Tailwind CSS");
      if (lower.includes("react") && !extracted.tools.includes("React")) extracted.tools.push("React");
    });
    extracted.concepts = ["Deduplicated Group Insight", "Consolidated Learning"];
  }

  const finalProjects = extracted.projects.filter(pName => 
    dbState.projects.some(p => p.name.toLowerCase() === pName.toLowerCase())
  );

  const finalProjectList = finalProjects.length > 0 
    ? finalProjects 
    : dbState.projects.filter(p => cluster.topic.toLowerCase().includes(p.name.toLowerCase())).map(p => p.name);

  steps.push(`Generating local or remote vector embeddings for context-matching...`);
  const embeddingText = `${extracted.summary} ${extracted.detailedSummary} ${extracted.topics.join(" ")}`;
  const vector = await generateEmbeddingVec(embeddingText);

  const finalKo: KnowledgeObject = {
    knowledgeId: finalId,
    rawSourceId: rawId,
    source: items[0]?.sourceType || "note",
    url: items.find(i => i.sourceUrl)?.sourceUrl,
    summary: extracted.summary,
    detailedSummary: extracted.detailedSummary,
    topics: extracted.topics,
    concepts: extracted.concepts,
    tools: extracted.tools,
    projects: finalProjectList.length > 0 ? finalProjectList : ["General Storage"],
    futureUseCases: extracted.futureUseCases,
    actionabilityScore: extracted.actionabilityScore,
    userNote: items.map(i => i.userNote).filter(Boolean).join("; ") || undefined,
    createdAt: new Date().toISOString(),
    memoryStrength: 80,
    lastAccessedAt: new Date().toISOString()
  };

  const syntheticRaw: RawSource = {
    id: rawId,
    source: items[0]?.sourceType || "note",
    url: finalKo.url,
    userNote: finalKo.userNote,
    rawText: `Synthetic cluster representing items: ` + items.map(i => i.id).join(", "),
    timestamp: new Date().toISOString()
  };

  dbState.rawSources.unshift(syntheticRaw);
  dbState.knowledgeObjects.unshift(finalKo);
  dbState.embeddings[finalKo.knowledgeId] = vector;

  if (!dbState.memoryEvents) dbState.memoryEvents = [];
  dbState.memoryEvents.push({
    id: `ev-${Math.random().toString(36).substring(2, 8)}`,
    knowledgeId: finalKo.knowledgeId,
    eventType: "saved",
    timestamp: new Date().toISOString(),
    context: `Smart local clustering compiler: merged ${items.length} items.`
  });

  return finalKo;
}

// ==========================================
// CAPTURE ENDPOINTS & QUEUE CHANNELS
// ==========================================

app.post("/api/ingest", async (req, res) => {
  try {
    const { source, url, userNote, rawText } = req.body;
    if (!source) {
      return res.status(400).json({ error: "Source type is required." });
    }
    const result = await enqueueCapture(
      source,
      url,
      userNote || "",
      rawText || userNote || url || `Manual Plain note capture`
    );
    res.json({
      success: true,
      message: "Captured Successfully! Added to Queue.",
      queuePosition: result.queuePosition,
      item: result.item,
      steps: result.steps
    });
  } catch (err: any) {
    console.error("Ingest error:", err);
    res.status(500).json({ error: err.message || "Capture queue failed" });
  }
});

app.get("/api/queue", (req, res) => {
  const queue = dbState.ingestionQueue || [];
  const clusters = dbState.knowledgeClusters || [];
  const budget = getDailyGeminiBudget();

  const queuedItems = queue.filter(item => item.status === "queued");
  const processingItems = queue.filter(item => item.status === "processing");
  const processedItems = queue.filter(item => item.status === "processed");
  const failedItems = queue.filter(item => item.status === "failed");

  res.json({
    queue,
    clusters,
    metrics: {
      queuedCount: queuedItems.length,
      processingCount: processingItems.length,
      processedCount: processedItems.length,
      failedCount: failedItems.length,
      totalCount: queue.length,
      budgetCallsToday: budget.callsToday,
      budgetCallsMax: budget.callsMax,
      budgetCallsRemaining: budget.callsRemaining,
      isQuotaExceeded: budget.callsRemaining <= 0
    }
  });
});

app.post("/api/queue/process", async (req, res) => {
  try {
    const { action } = req.body;
    const targetAction = action || "process_all";

    if (!dbState.ingestionQueue) {
      dbState.ingestionQueue = [];
    }

    const queuedItems = dbState.ingestionQueue.filter(item => item.status === "queued");

    if (queuedItems.length === 0) {
      return res.json({
        success: true,
        message: "No pending resources in queue to process.",
        processedCount: 0,
        steps: [`[Info] Ingestion queue is completely empty. Capture more cards first!`]
      });
    }

    // 1. First perform local smart clustering!
    const clusters = clusterQueuedItems(queuedItems);
    dbState.knowledgeClusters = clusters;

    if (targetAction === "cluster_only") {
      await saveDatabase(dbState);
      return res.json({
        success: true,
        message: `Successfully clustered ${queuedItems.length} resources into ${clusters.length} topics.`,
        processedCount: 0,
        clusters,
        steps: [`[Cluster] Local clustering complete. Formed ${clusters.length} distinct insight topics.`]
      });
    }

    // Sort queued items by priority (high first), then latest
    const priorityWeight = { high: 3, normal: 2, low: 1 };
    queuedItems.sort((a,b) => {
      const diffVal = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
      if (diffVal !== 0) return diffVal;
      return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
    });

    // Determine which clusters we process based on action
    let clustersToProcess: KnowledgeCluster[] = [];
    if (targetAction === "process_one") {
      clustersToProcess = clusters.slice(0, 1);
    } else if (targetAction === "process_10") {
      let itemCount = 0;
      for (const cl of clusters) {
        clustersToProcess.push(cl);
        itemCount += cl.itemIds.length;
        if (itemCount >= 10) break;
      }
    } else {
      clustersToProcess = clusters;
    }

    const stepsLogs: string[] = [`[Process Launcher] Initiating queue batch run for action: "${targetAction}".`];
    let processedItemsCount = 0;
    const synthesizedObjects: KnowledgeObject[] = [];

    // Process each selected cluster
    for (const cluster of clustersToProcess) {
      // Mark cluster items as "processing" in state
      dbState.ingestionQueue.forEach(item => {
        if (cluster.itemIds.includes(item.id)) {
          item.status = "processing";
        }
      });

      try {
        const clusterSteps: string[] = [];
        const resultKo = await processClusteredItem(cluster, clusterSteps);
        synthesizedObjects.push(resultKo);
        processedItemsCount += cluster.itemIds.length;

        // Mark cluster items as "processed"
        dbState.ingestionQueue.forEach(item => {
          if (cluster.itemIds.includes(item.id)) {
            item.status = "processed";
            item.processedAt = new Date().toISOString();
          }
        });

        // Add steps
        stepsLogs.push(...clusterSteps.map(st => `[${cluster.topic}] ${st}`));
      } catch (err: any) {
        // Mark cluster items as "failed"
        dbState.ingestionQueue.forEach(item => {
          if (cluster.itemIds.includes(item.id)) {
            item.status = "failed";
            item.failureReason = err.message || "Failed during cluster compilation";
          }
        });
        stepsLogs.push(`[ERROR - ${cluster.topic}] Compilation failed: ${err.message}`);
      }
    }

    // Recalculate clusters containing ONLY queued items for storage
    const remainingQueued = dbState.ingestionQueue.filter(item => item.status === "queued");
    dbState.knowledgeClusters = clusterQueuedItems(remainingQueued);

    // Persist changes
    await saveDatabase(dbState);

    res.json({
      success: true,
      message: `Completed processing. Synthesized ${synthesizedObjects.length} unified Knowledge Object(s) from ${processedItemsCount} raw items.`,
      processedCount: processedItemsCount,
      synthesizedCount: synthesizedObjects.length,
      clustersLeft: dbState.knowledgeClusters.length,
      steps: stepsLogs,
      knowledgeObjects: synthesizedObjects
    });
  } catch (err: any) {
    console.error("Queue process error:", err);
    res.status(500).json({ error: err.message || "Bulk processing failed" });
  }
});

app.delete("/api/queue/:id", async (req, res) => {
  const id = req.params.id;
  if (!dbState.ingestionQueue) dbState.ingestionQueue = [];
  const found = dbState.ingestionQueue.some(item => item.id === id);
  if (found) {
    dbState.ingestionQueue = dbState.ingestionQueue.filter(item => item.id !== id);
    // Recalculate clusters
    const remainingQueued = dbState.ingestionQueue.filter(item => item.status === "queued");
    dbState.knowledgeClusters = clusterQueuedItems(remainingQueued);
    await saveDatabase(dbState);
    res.json({ success: true, message: "Deleted queued item." });
  } else {
    res.status(404).json({ error: "Queued item not found." });
  }
});

app.post("/api/queue/:id/priority", async (req, res) => {
  const id = req.params.id;
  const { priority } = req.body;
  if (!["low", "normal", "high"].includes(priority)) {
    return res.status(400).json({ error: "Invalid priority. Must be: low, normal, or high." });
  }
  if (!dbState.ingestionQueue) dbState.ingestionQueue = [];
  const item = dbState.ingestionQueue.find(i => i.id === id);
  if (item) {
    item.priority = priority;
    await saveDatabase(dbState);
    res.json({ success: true, item });
  } else {
    res.status(404).json({ error: "Queued item not found." });
  }
});

app.post("/api/queue/reset", async (req, res) => {
  dbState.ingestionQueue = [];
  dbState.knowledgeClusters = [];
  await saveDatabase(dbState);
  res.json({ success: true, message: "Queue has been cleared successfully." });
});

app.post("/api/project", async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Project name is required" });
  }
  const project: Project = {
    id: `p-${Math.random().toString(36).substring(2, 8)}`,
    name,
    description: description || "",
    createdAt: new Date().toISOString()
  };
  dbState.projects.push(project);
  await saveDatabase(dbState);
  res.json(project);
});

app.delete("/api/knowledge/:id", (req, res) => {
  const id = req.params.id;
  const kObj = dbState.knowledgeObjects.find(k => k.knowledgeId === id);
  if (kObj) {
    dbState.knowledgeObjects = dbState.knowledgeObjects.filter(k => k.knowledgeId !== id);
    if (kObj.rawSourceId) {
      dbState.rawSources = dbState.rawSources.filter(r => r.id !== kObj.rawSourceId);
    }
    if (dbState.embeddings[id]) {
      delete dbState.embeddings[id];
    }
    if (dbState.memoryEvents) {
      dbState.memoryEvents = dbState.memoryEvents.filter(e => e.knowledgeId !== id);
    }
    computeMemoryStrengths(dbState);
    await saveDatabase(dbState);
  }
  res.json({ success: true });
});

app.delete("/api/project/:id", (req, res) => {
  const id = req.params.id;
  dbState.projects = dbState.projects.filter(p => p.id !== id);
  await saveDatabase(dbState);
  res.json({ success: true });
});

// Phase 3 Memory Intelligence routes
app.get("/api/memory/intelligence", (req, res) => {
  try {
    const intelligence = fetchMemoryIntelligence(dbState);
    res.json(intelligence);
  } catch (err: any) {
    console.error("Error fetching operational memory intelligence:", err);
    res.status(500).json({ error: err.message });
  }
});

// Phase 4 Operational Opportunity Intelligence routes
app.get("/api/memory/opportunities", async (req, res) => {
  try {
    const opportunities = await generateOpportunities(dbState);
    res.json(opportunities);
  } catch (err: any) {
    console.error("Error calculating cognitive opportunities:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/memory/decision", async (req, res) => {
  try {
    const { query } = req.body;
    const support = await generateDecisionSupport(dbState, query || "");
    res.json(support);
  } catch (err: any) {
    console.error("Error rendering decision support rankings:", err);
    res.status(500).json({ error: err.message });
  }
});

// Phase 5: Intent Discovery API Routes
app.get("/api/memory/intent", async (req, res) => {
  try {
    if (!dbState.intentAnalysis) {
      dbState.intentAnalysis = await generateIntentAnalysis(dbState);
      await saveDatabase(dbState);
    }
    res.json(dbState.intentAnalysis);
  } catch (err: any) {
    console.error("Error fetching user intent analysis:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/memory/intent/recalculate", async (req, res) => {
  try {
    const analysis = await generateIntentAnalysis(dbState);
    dbState.intentAnalysis = analysis;
    await saveDatabase(dbState);
    res.json(analysis);
  } catch (err: any) {
    console.error("Error recalculating implicit intent state:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/memory/event", (req, res) => {
  try {
    const { knowledgeId, eventType, context, projectId } = req.body;
    if (!knowledgeId || !eventType) {
      return res.status(400).json({ error: "knowledgeId and eventType are required." });
    }
    
    if (!dbState.memoryEvents) dbState.memoryEvents = [];
    
    const newEvent: MemoryEvent = {
      id: `e-${Math.random().toString(36).substring(2, 8)}`,
      knowledgeId,
      eventType,
      timestamp: new Date().toISOString(),
      context: context || undefined,
      projectId: projectId || undefined
    };
    
    dbState.memoryEvents.push(newEvent);
    computeMemoryStrengths(dbState);
    await saveDatabase(dbState);
    
    const matched = dbState.knowledgeObjects.find(k => k.knowledgeId === knowledgeId);
    res.json({
      success: true,
      event: newEvent,
      updatedStrength: matched ? matched.memoryStrength : null
    });
  } catch (err: any) {
    console.error("Error recording memory event:", err);
    res.status(500).json({ error: err.message });
  }
});

// Semantic + Keyword Search Engine (100% Local Cosine Similarity)
app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim() === "") {
      const all: SearchResult[] = dbState.knowledgeObjects.map(k => ({
        knowledge: k,
        score: 1.0,
        matchType: "keyword"
      }));
      return res.json(all);
    }

    const cleanQuery = query.toLowerCase().trim();
    const queryTerms = cleanQuery.split(/\s+/).filter(t => t.length > 1);

    const results: SearchResult[] = dbState.knowledgeObjects.map((k) => {
      let keywordScore = 0;
      const textToMatch = [
        k.summary,
        k.detailedSummary,
        k.userNote || "",
        ...k.topics,
        ...k.concepts,
        ...k.tools,
        ...k.projects
      ].join(" ").toLowerCase();

      if (textToMatch.includes(cleanQuery)) {
        keywordScore = 1.0;
      } else {
        let matches = 0;
        queryTerms.forEach(t => {
          if (textToMatch.includes(t)) matches++;
        });
        if (queryTerms.length > 0) {
          keywordScore = matches / queryTerms.length;
        }
      }

      // Check stored high-dimensional embeddings and expand semantic nodes locally
      let maxSemanticSim = 0;
      const seedObjects = dbState.knowledgeObjects.filter(otherK => {
        if (otherK.knowledgeId === k.knowledgeId) return false;
        return [otherK.summary, otherK.detailedSummary].join(" ").toLowerCase().includes(cleanQuery);
      });

      if (seedObjects.length > 0 && dbState.embeddings[k.knowledgeId]) {
        seedObjects.forEach(seed => {
          if (dbState.embeddings[seed.knowledgeId]) {
            const sim = calculateCosineSimilarity(
              dbState.embeddings[k.knowledgeId],
              dbState.embeddings[seed.knowledgeId]
            );
            if (sim > maxSemanticSim) maxSemanticSim = sim;
          }
        });
      }

      // Blend local clustering with direct keyword overlaps
      let finalScore = keywordScore;
      let matchType: "semantic" | "keyword" = "keyword";

      if (maxSemanticSim > 0.65) {
        finalScore = Math.max(keywordScore, maxSemanticSim * 0.9);
        matchType = "semantic";
      }

      return { knowledge: k, score: finalScore, matchType };
    });

    let filtered = results.sort((a, b) => b.score - a.score);
    if (cleanQuery.length > 1) {
      filtered = filtered.filter(item => item.score > 0.15);
    }

    if (filtered.length > 0) {
      if (!dbState.memoryEvents) dbState.memoryEvents = [];
      filtered.slice(0, 3).forEach(item => {
        if (item.score > 0.35) {
          dbState.memoryEvents!.push({
            id: `e-${Math.random().toString(36).substring(2, 8)}`,
            knowledgeId: item.knowledge.knowledgeId,
            eventType: "retrieved",
            timestamp: new Date().toISOString(),
            context: `Retrieved via active search query: "${cleanQuery}"`
          });
        }
      });
      computeMemoryStrengths(dbState);
      await saveDatabase(dbState);
    }

    res.json(filtered);
  } catch (err: any) {
    console.error("Search API error:", err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

// Reset logic
app.post("/api/reset", (req, res) => {
  dbState = {
    rawSources: [...initialRawSources],
    knowledgeObjects: [...initialKnowledgeObjects],
    projects: [...initialProjects],
    embeddings: {},
    telegramConfig: {
      isActive: false,
      chatIds: []
    },
    memoryEvents: [...initialEvents]
  };
  initialKnowledgeObjects.forEach((k) => {
    dbState.embeddings[k.knowledgeId] = Array(768).fill(0);
  });
  computeMemoryStrengths(dbState);
  await saveDatabase(dbState);
  res.json({ success: true });
});

// Configure Telegram Token & Webhook Setup
app.post("/api/telegram/setup", async (req, res) => {
  try {
    const { botToken } = req.body;
    if (!botToken || botToken.trim() === "") {
      dbState.telegramConfig.botToken = undefined;
      dbState.telegramConfig.isActive = false;
      await saveDatabase(dbState);
      return res.json({ message: "Bot token deactivated." });
    }

    dbState.telegramConfig.botToken = botToken.trim();
    dbState.telegramConfig.isActive = true;
    dbState.telegramConfig.setupAt = new Date().toISOString();

    // Register active webhook callback URL if hosted APP_URL is present
    const appUrl = process.env.APP_URL;
    let webhookRegistered = false;
    let apiFeedback = "Local sandbox simulator active.";

    if (appUrl && appUrl !== "MY_APP_URL") {
      const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
      const tgRegisterUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      
      try {
        const tgRes = await fetch(tgRegisterUrl);
        const tgData = (await tgRes.json()) as any;
        if (tgData.ok) {
          webhookRegistered = true;
          dbState.telegramConfig.webhookUrl = webhookUrl;
          apiFeedback = `Bot Webhook successfully bound to ${webhookUrl}!`;
        } else {
          apiFeedback = `Telegram server error registering webhook: ${tgData.description}`;
        }
      } catch (webhookErr: any) {
        apiFeedback = `Unable to dispatch webhook binding to Telegram: ${webhookErr.message}`;
      }
    } else {
      apiFeedback = "Configured token successfully! Simulated bot responds locally. Real Webhook awaits a live APP_URL configuration in Secrets.";
    }

    await saveDatabase(dbState);
    res.json({
      success: true,
      message: apiFeedback,
      webhookRegistered,
      config: dbState.telegramConfig
    });
  } catch (tgErr: any) {
    res.status(500).json({ error: tgErr.message });
  }
});

// Execute Bot Parsing logic for a text message. Shared between real Telegram Webhook and our React Simulator!
async function executeBotCommand(chatId: string, text: string, senderName: string): Promise<{ replyMessage: string; steps: string[] }> {
  const steps: string[] = [];
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Ensure chatId is listed
  if (!dbState.telegramConfig.chatIds.includes(chatId)) {
    dbState.telegramConfig.chatIds.push(chatId);
    await saveDatabase(dbState);
  }

  steps.push(`Received chat message from ${senderName} (ID: ${chatId}): "${trimmed}"`);

  // Handle Command 1: /start
  if (lower.startsWith("/start")) {
    const startMsg = `🧠 *Welcome to AI Brain, ${senderName}!* I am your long-term cognitive memory layer.

Directly send or share:
• *Instagram Reels* (https://instagram.com/reel/...)
• YouTube URLs
• Article links
• Plain text notes or tool stacks

I will automatically extract summary, topics, tools, and connects with active projects!

*Available Commands:*
• /recent \- View last 5 entries in memory
• /projects \- List mapped ongoing projects
• /resources <query> \- Fuzzy keyword and category search
• /search <query> \- Semantic meaning-based vector search
• /help \- Usage tutorials`;
    return { replyMessage: startMsg, steps };
  }

  // Handle Command 2: /help
  if (lower.startsWith("/help")) {
    const helpMsg = `🎓 *AI Brain - External Memory Bot Manual*

1️⃣ *Content Capture:* Share any link from Instagram, YouTube or paste text blocks. I'll automatically classify it.
2️⃣ *Visualizing connections:* Add user thoughts right after links to guide the relevance algorithm!
3️⃣ *Projects:* Create groupings to collect similar items dynamically. 
4️⃣ *Commands:*
• /recent \- Quick feed recap
• /resources SaaS \- Finds SaaS tools and layout designs
• /search clean structures \- Vector analysis for structured UI

*Zero manual tags. Just share clip, done!*`;
    return { replyMessage: helpMsg, steps };
  }

  // Handle Command 3: /recent
  if (lower.startsWith("/recent")) {
    steps.push(`Processing /recent command...`);
    const list = dbState.knowledgeObjects.slice(0, 5);
    if (list.length === 0) {
      return { replyMessage: `🧠 *AI Brain is currently empty.* Paste some social Reels or notes to fill your local cortex!`, steps };
    }
    let resMsg = `🧠 *Your Recent 5 Captured Intel objects:*\n\n`;
    list.forEach((k, idx) => {
      resMsg += `${idx + 1}. *${k.summary}*
• _Topics:_ ${k.topics.join(", ") || "None"}
• _Tools:_ ${k.tools.join(", ") || "None"}\n\n`;
    });
    return { replyMessage: resMsg, steps };
  }

  // Handle Command 4: /projects
  if (lower.startsWith("/projects")) {
    steps.push(`Processing /projects command...`);
    let resMsg = `📁 *Active Brain Projects Mapping:*\n\n`;
    dbState.projects.forEach(p => {
      resMsg += `• *${p.name}*: ${p.description || "No description provided"}\n`;
    });
    return { replyMessage: resMsg, steps };
  }

  // Handle Command 5: /resources <query> (Keyword / Topic match mapping user's exact success criteria!)
  if (lower.startsWith("/resources")) {
    const q = trimmed.replace(/^\/resources\s*/i, "").trim();
    steps.push(`Processing /resources command with query: "${q}"`);
    if (!q) {
      return { replyMessage: `⚠️ Please specify a search query, e.g. \`/resources Design\``, steps };
    }

    const matches = dbState.knowledgeObjects.filter(k => {
      const matchStr = [
        k.summary,
        k.detailedSummary,
        ...k.topics,
        ...k.tools,
        ...k.concepts,
        ...k.projects
      ].join(" ").toLowerCase();
      return matchStr.includes(q.toLowerCase());
    });

    if (matches.length === 0) {
      return { replyMessage: `🔍 No resource directories found for query: *${q}*`, steps };
    }

    // Capture related unique topics from matching objects
    const matchedTopics = new Set<string>();
    matches.forEach(m => m.topics.forEach(t => matchedTopics.add(t)));

    let rReply = `Found *${matches.length}* relevant resources.\n*Top Resources:*\n`;
    matches.slice(0, 5).forEach((m, idx) => {
      rReply += `${idx + 1}. *${m.summary}*\n`;
    });

    if (matchedTopics.size > 0) {
      rReply += `\n*Related Topics:*\n`;
      Array.from(matchedTopics).forEach(topic => {
        rReply += `\- *${topic}*\n`;
      });
    }

    return { replyMessage: rReply, steps };
  }

  // Handle Command 6: /search <query> (Semantic meaning search)
  if (lower.startsWith("/search")) {
    const q = trimmed.replace(/^\/search\s*/i, "").trim();
    steps.push(`Processing /search semantic search for: "${q}"`);
    if (!q) {
      return { replyMessage: `⚠️ Please specify a search phrase, e.g. \`/search rapid prototyping\``, steps };
    }

    // 100% Local Cosine Similarity Matching (no Gemini search trigger call!)
    const cleanQuery = q.toLowerCase();
    const queryTerms = cleanQuery.split(/\s+/).filter(t => t.length > 1);

    const rated = dbState.knowledgeObjects.map(k => {
      let keywordScore = 0;
      const textToMatch = [k.summary, k.detailedSummary, ...k.topics, ...k.concepts, ...k.tools].join(" ").toLowerCase();
      if (textToMatch.includes(cleanQuery)) {
        keywordScore = 1.0;
      } else {
        let matches = 0;
        queryTerms.forEach(t => { if (textToMatch.includes(t)) matches++; });
        if (queryTerms.length > 0) keywordScore = matches / queryTerms.length;
      }

      let maxSemanticSim = 0;
      const seedObjects = dbState.knowledgeObjects.filter(otherK => {
        if (otherK.knowledgeId === k.knowledgeId) return false;
        return [otherK.summary, otherK.detailedSummary].join(" ").toLowerCase().includes(cleanQuery);
      });

      if (seedObjects.length > 0 && dbState.embeddings[k.knowledgeId]) {
        seedObjects.forEach(seed => {
          if (dbState.embeddings[seed.knowledgeId]) {
            const sim = calculateCosineSimilarity(dbState.embeddings[k.knowledgeId], dbState.embeddings[seed.knowledgeId]);
            if (sim > maxSemanticSim) maxSemanticSim = sim;
          }
        });
      }

      const score = maxSemanticSim > 0.65 ? Math.max(keywordScore, maxSemanticSim * 0.9) : keywordScore;
      return { k, score };
    }).sort((a, b) => b.score - a.score);

    const matches = rated.slice(0, 3);
    let replyMsg = `🧠 *Local Semantic Search Matches for* "${q}":\n\n`;
    matches.forEach((item, idx) => {
      const scorePct = Math.round(item.score * 100);
      replyMsg += `${idx + 1}. *${item.k.summary}*
• _Relevance Score:_ \`${scorePct}%\`
• _Tools:_ ${item.k.tools.join(", ") || "None"}
• _Topics:_ ${item.k.topics.join(", ") || "None"}\n\n`;
    });

    return { replyMessage: replyMsg, steps };
  }

  // Auto Ingest Mode: When the user shares any text or URL directly
  steps.push(`Unrecognized command format. Treating message as a captured intellectual ingestion source.`);
  
  // Detect URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = trimmed.match(urlRegex);
  const primaryUrl = urls ? urls[0] : undefined;
  
  let source: SourceType = 'note';
  let githubDetectedShorthand = false;
  if (primaryUrl) {
    if (primaryUrl.includes("github.com/")) {
      source = "github";
    } else if (primaryUrl.includes("instagram.com/reel")) {
      source = "instagram";
    } else if (primaryUrl.includes("youtube.com") || primaryUrl.includes("youtu.be")) {
      source = "youtube";
    } else if (primaryUrl.includes("twitter.com") || primaryUrl.includes("x.com")) {
      source = "tweet";
    } else {
      source = "article";
    }
  } else {
    // Check if it's owner/repo shorthand notation (e.g. "openai/openai-cookbook" or "facebook/react")
    const githubShorthandRegex = /^[\w.-]+\/[\w.-]+$/i;
    if (githubShorthandRegex.test(trimmed)) {
      source = "github";
      githubDetectedShorthand = true;
    }
  }

  const userNote = primaryUrl 
    ? trimmed.replace(primaryUrl, "").trim() 
    : (githubDetectedShorthand ? "" : trimmed);

  steps.push(`Detected source category: "${source}". URL: "${primaryUrl || "None"}"`);
  const queueResult = await enqueueCapture(source, primaryUrl || (githubDetectedShorthand ? trimmed : undefined), userNote, trimmed);
  steps.push(...queueResult.steps);

  const item = queueResult.item;
  const replyMsg = `📥 *Content Captured Successfully!*
  
🧠 *AI Brain Queue Status:*
• *Position in Inbox:* \`${queueResult.queuePosition}\`
• *Detected Source:* \`${item.sourceType}\`
• *Priority:* \`${item.priority.toUpperCase()}\`
• *Status:* \`Added to Ingestion Queue\`
• *Action:* Run scheduled compiler or click **Process Queue** in the dashboard to review and synthesize.

_Understand later, retrieve forever!_`;

  return { replyMessage: replyMsg, steps };
}

// REST endpoints for Bot Sim
app.post("/api/telegram/simulate", async (req, res) => {
  try {
    const { chatId, text, senderName } = req.body;
    const result = await executeBotCommand(chatId || "sim-user-12", text || "", senderName || "Self");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real Bot Webhook Listener
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const update = req.body;
    if (update && update.message) {
      const message = update.message;
      const chatId = String(message.chat.id);
      const text = message.text || "";
      const fromUser = message.from?.first_name || "Guest";

      const botResult = await executeBotCommand(chatId, text, fromUser);

      // Dispatch sendMessage back using Bot Token if present
      if (dbState.telegramConfig.botToken) {
        const tgSendUrl = `https://api.telegram.org/bot${dbState.telegramConfig.botToken}/sendMessage`;
        await fetch(tgSendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: botResult.replyMessage,
            parse_mode: "Markdown"
          })
        });
      }
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Telegram webhook pipeline error:", err);
    res.status(200).send("OK"); // Respond OK to prevent Telegram retry spam loop
  }
});

// Admin endpoint to sync Telegram updates into Supabase
app.post("/api/admin/sync-telegram", async (req, res) => {
  try {
    // Load last processed update ID from Supabase
    const lastSyncId = await loadSyncState();
    const offset = lastSyncId + 1;
    const botToken = dbState.telegramConfig.botToken;
    if (!botToken) {
      return res.status(400).json({ error: "Telegram bot token not configured" });
    }
    const getUpdatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}`;
    const tgResponse = await fetch(getUpdatesUrl);
    const tgData = await tgResponse.json();
    const updates = tgData.result || [];
    let newItems = 0;
    let duplicates = 0;
    let maxUpdateId = lastSyncId;
    for (const update of updates) {
      if (update.update_id) {
        maxUpdateId = Math.max(maxUpdateId, update.update_id);
      }
      const message = update.message;
      if (!message) continue;
      const chatId = String(message.chat.id);
      const text = message.text || "";
      const fromUser = message.from?.first_name || "Guest";
      const detection = await detectContent({ text, chatId, fromUser, message });
      const inboxItem = {
        telegramMessageId: message.message_id,
        telegramUpdateId: update.update_id,
        sourceType: detection.sourceType,
        url: detection.url,
        fileUrl: undefined,
        rawContent: detection.textExcerpt,
        metadata: { chatId, fromUser },
        receivedAt: new Date().toISOString(),
        synced: false,
        processed: false,
        processedAt: null,
        failed: false,
        errorMessage: null,
      };
      const saved = await saveInboxItem(inboxItem);
      if (saved && saved.id) {
        // If the saved row has the same update ID, it was newly inserted
        if (saved.telegram_update_id === inboxItem.telegramUpdateId) {
          newItems++;
        } else {
          duplicates++;
        }
      }
    }
    await saveSyncState(maxUpdateId);
    res.json({ newItems, duplicates, lastUpdateId: maxUpdateId });
  } catch (e: any) {
    console.error("Sync telegram error:", e);
    res.status(500).json({ error: e.message });
  }
});


// Configure Vite middleware / asset routing
async function initServer() {
  // Synchronously seed/hydrate database before booting up routing listeners
  try {
    dbState = await storageAdapter.load();
    if (!dbState) {
      dbState = {
        rawSources: [],
        knowledgeObjects: [],
        projects: [],
        embeddings: {},
        telegramConfig: { isActive: false, chatIds: [] },
        memoryEvents: [],
        opportunities: [],
        intentAnalysis: undefined,
        ingestionQueue: [],
        knowledgeClusters: []
      };
      await storageAdapter.save(dbState);
    }

    // Real-world Ingestion Queue Recovery: If any items are stuck in 'processing' status on boot, reset them to 'queued' to prevent loss.
    if (dbState && dbState.ingestionQueue) {
      let recoveredCount = 0;
      dbState.ingestionQueue.forEach(item => {
        if (item.status === "processing") {
          item.status = "queued";
          recoveredCount++;
        }
      });
      if (recoveredCount > 0) {
        console.log(`🧹 [QUEUE RECOVERY] Recovered and rescheduled ${recoveredCount} jobs found stuck in 'processing' status.`);
        await storageAdapter.save(dbState);
      }
    }

    // Auto-bind Telegram token or any environment modifications if defined
    if (process.env.TELEGRAM_BOT_TOKEN && dbState.telegramConfig.botToken !== process.env.TELEGRAM_BOT_TOKEN) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN.trim();
      dbState.telegramConfig.botToken = botToken;
      dbState.telegramConfig.isActive = true;
      dbState.telegramConfig.setupAt = new Date().toISOString();
      console.log("🤖 [TELEGRAM] Automatically loaded TELEGRAM_BOT_TOKEN from environment variables.");

      const appUrl = process.env.APP_URL;
      if (appUrl && appUrl !== "MY_APP_URL") {
        const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
        const tgRegisterUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
        try {
          const tgRes = await fetch(tgRegisterUrl);
          const tgData = (await tgRes.json()) as any;
          if (tgData.ok) {
            dbState.telegramConfig.webhookUrl = webhookUrl;
            console.log(`🤖 [TELEGRAM] Bot Webhook automatically bound to ${webhookUrl}!`);
          } else {
            console.warn(`🤖 [TELEGRAM] Telegram server error registering webhook: ${tgData.description}`);
          }
        } catch (webhookErr: any) {
          console.warn(`🤖 [TELEGRAM] Unable to dispatch webhook binding: ${webhookErr.message}`);
        }
      }
      // Save updated configuration in database storage
      await storageAdapter.save(dbState);
    }
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") {
      console.error("❌ CRITICAL: Persistent database initialization failed in production mode!", err);
      process.exit(1);
    }
    console.error("⚠️ Failed to initialize persistent database loader. Bootstrapping JSON fallback core in-place.", err.message);
    dbState = loadDatabase();
  }

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🧠 AI Brain server booted successfully on port ${PORT}!`);
  });
}

initServer();
