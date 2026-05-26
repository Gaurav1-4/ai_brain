/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Share2, 
  FileText, 
  Instagram, 
  Youtube, 
  Twitter, 
  Globe, 
  Cpu, 
  FolderPlus, 
  ArrowRight, 
  BrainCircuit, 
  CheckSquare, 
  ListCollapse, 
  Sparkles, 
  History, 
  Gauge, 
  Lightbulb,
  CheckCircle2,
  RefreshCw,
  GitMerge,
  Github,
  ChevronRight,
  TrendingUp,
  FolderOpen
} from "lucide-react";
import { KnowledgeObject, IntentAnalysis, Project, SourceType } from "../types";

interface AcquisitionIntentEngineProps {
  knowledgeObjects: KnowledgeObject[];
  projects: Project[];
  onStateUpdate: () => void;
}

// 5 Curated high-yield operational presets representing standard real-world bookmarks
const SOURCE_PRESETS = [
  {
    id: "pre-github",
    label: "GitHub: openai/openai-cookbook",
    source: "github" as const,
    url: "https://github.com/openai/openai-cookbook",
    text: "Examples and guides for using the OpenAI API. Includes code snippets for embeddings, structured outputs, fine-tuning, and simple agents.",
    display: "GitHub Repository",
    icon: Github,
    color: "text-amber-600 bg-amber-50 border-amber-100 font-bold"
  },
  {
    id: "pre-insta",
    label: "Insta Reel: SaaS Monetization Pricing",
    source: "instagram" as const,
    url: "https://www.instagram.com/reel/C8_SaaSVideo_92/",
    text: "How to price your web software widgets appropriately to boost retention by 200%. Uses Stripe rules, micro-payment tiers, and custom credit balances.",
    display: "Instagram Reel",
    icon: Instagram,
    color: "text-pink-600 bg-pink-50 border-pink-100"
  },
  {
    id: "pre-youtube",
    label: "YouTube: RAG Pipeline with Gemini",
    source: "youtube" as const,
    url: "https://www.youtube.com/watch?v=AiAgentsRAG",
    text: "Complete tutorial on setting up real-time multi-agent orchestrations with Gemini-3.5-flash context windows, integrating LangGraph and local SQLite caching layers for instant speeds.",
    display: "YouTube Transcript",
    icon: Youtube,
    color: "text-red-600 bg-red-50 border-red-100"
  },
  {
    id: "pre-tweet",
    label: "Tweet: Express local Docker sandbox",
    source: "tweet" as const,
    url: "https://x.com/levelsio/status/192238",
    text: "Just containerized my entire local Express database sandbox in under 40 seconds using Docker. Simple port binding on 3000 to keep routing reliable.",
    display: "Tweet Resource",
    icon: Twitter,
    color: "text-sky-600 bg-sky-50 border-sky-100"
  },
  {
    id: "pre-pdf",
    label: "PDF: Supabase Row Level Security",
    source: "pdf" as const,
    url: "https://intel.pdf/supabase-security-guide",
    text: "Official Document: Supabase Row Level Security guidelines, database connection pooling parameters, and multi-tenant security headers.",
    display: "Technical PDF Capture",
    icon: FileText,
    color: "text-stone-700 bg-stone-50 border-stone-200"
  },
  {
    id: "pre-article",
    label: "Web article: Design vertical grids",
    source: "article" as const,
    url: "https://gozora.io/blog/8px-vertical-rhythms",
    text: "Editorial analysis of Gozora visual design systems centering horizontal content rows, vertical display grid alignments, and high contrast typography.",
    display: "Website Article Analysis",
    icon: Globe,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100"
  }
];

export function AcquisitionIntentEngine({ knowledgeObjects, projects, onStateUpdate }: AcquisitionIntentEngineProps) {
  const [intent, setIntent] = useState<IntentAnalysis | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  
  // Custom manual share URL/note states
  const [customUrl, setCustomUrl] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [selectedSourceType, setSelectedSourceType] = useState<SourceType>("github");

  // Local state pipeline execution trace logs
  const [executingPresetId, setExecutingPresetId] = useState<string | null>(null);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch intent analysis on load or database updates
  const fetchIntentAnalysis = async () => {
    setLoadingIntent(true);
    try {
      const res = await fetch("/api/memory/intent");
      if (res.ok) {
        const data = await res.json();
        setIntent(data);
      }
    } catch (err) {
      console.error("Error fetching user intent matrix:", err);
    } finally {
      setLoadingIntent(false);
    }
  };

  const forceRecalculateIntent = async () => {
    setLoadingIntent(true);
    setPipelineLogs(prev => [...prev, "⚡ Forcing AI Cortex Intent review over complete corpus..."]);
    try {
      const res = await fetch("/api/memory/intent/recalculate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIntent(data);
        setPipelineLogs(prev => [...prev, "✅ Implicit Intent recalculation completed successfully."]);
      }
    } catch (err) {
      console.error("Error recalculating implicit intent state:", err);
    } finally {
      setLoadingIntent(false);
    }
  };

  useEffect(() => {
    fetchIntentAnalysis();
  }, [knowledgeObjects]);

  // Handle Frictionless Simulation Share action!
  const triggerSimulationCapture = async (preset: typeof SOURCE_PRESETS[0]) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setExecutingPresetId(preset.id);
    
    // Build real-time simulated visual pipeline logs
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setPipelineLogs([...logs]);
    };

    addLog(`📥 CAPTURE TRIGGER: Frictionless Link Shared from mobile viewport.`);
    addLog(`🔗 Source identified: "${preset.display}" (${preset.url})`);
    
    try {
      // Step 2: Ingest into backend via standard processCapturePipeline REST route
      addLog(`⚙️ Pipeline initialized: parsing metadata & transcript details...`);
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: preset.source,
          url: preset.url,
          userNote: `Captured instantaneously, zero form filing: ${preset.text}`,
          rawText: preset.text
        })
      });

      if (!res.ok) throw new Error("Ingestion response failed");

      const ingestResult = await res.json();
      
      addLog(`✨ COGNITIVE EXTRACTION: Gemini summarized coordinates safely.`);
      addLog(`🏷️ Extracted Topics: ${ingestResult.knowledge.topics.join(", ")}`);
      addLog(`🛠️ Detected Tools: ${ingestResult.knowledge.tools.join(", ") || "None detected"}`);
      
      addLog(`🧠 INTENT ALIGNER: Synthesizing database overlap against goal vectors...`);
      
      // Let's refetch parent state which automatically updates the opportunities
      onStateUpdate();
      
      // Add small timeout to simulate the background auto-linking pipelines
      setTimeout(async () => {
        // Refresh intent analysis to reveal the dynamic updates
        const intentRes = await fetch("/api/memory/intent");
        if (intentRes.ok) {
          const updatedIntent = await intentRes.json();
          setIntent(updatedIntent);
          addLog(`📂 PROJECT MATRIX UPDATED: Linked to folders based on matching concepts.`);
          addLog(`💡 OPPORTUNITY GENERATED: Confidence score inferred at ${updatedIntent.confidenceScore}%!`);
          addLog(`🏆 RESULT: Knowledge Object successfully locked to External memory layer.`);
        }
        setIsProcessing(false);
        setExecutingPresetId(null);
      }, 1200);

    } catch (err: any) {
      addLog(`❌ ERROR: Acquisition hook failed: ${err.message}`);
      setIsProcessing(false);
      setExecutingPresetId(null);
    }
  };

  // Custom link ingestion
  const handleCustomIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim() && !customNote.trim()) return;
    setIsProcessing(true);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setPipelineLogs([...logs]);
    };

    addLog(`📥 CUSTOM INGESTION TRACE: Scraping URL / Notes input.`);
    
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSourceType,
          url: customUrl || undefined,
          userNote: customNote,
          rawText: customNote || customUrl
        })
      });

      if (!res.ok) throw new Error("Custom ingest pipeline rejected request");
      
      const resData = await res.json();
      addLog(`✨ Extraction completed. Summary: "${resData.knowledge.summary}"`);
      addLog(`🧠 Rerunning dynamic intent matching...`);
      
      setCustomUrl("");
      setCustomNote("");
      onStateUpdate();

      setTimeout(async () => {
        await fetchIntentAnalysis();
        addLog(`💡 Intent updated. Ingest successful!`);
        setIsProcessing(false);
      }, 1000);

    } catch (err: any) {
      addLog(`❌ Custom Ingestion failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // Helper score color mapper
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 75) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-stone-600 bg-stone-50 border-stone-200";
  };

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)] overflow-hidden" id="phase-5-acquisition-intent-engine">
      
      {/* Title Header */}
      <div className="p-6 border-b border-[#e5e5e0] bg-stone-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-neutral-900 text-white text-[8px] font-bold uppercase tracking-widest font-mono rounded">Phase 5</span>
            <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
              <BrainCircuit className="text-stone-800 animate-pulse" size={16} />
              <span>Knowledge Acquisition & Intent Engine</span>
            </h2>
          </div>
          <p className="text-xs text-[#73736e]">Zero tags. Frictionless shared resource ingestion linked instantly with automated implicit goal detection.</p>
        </div>

        <button 
          onClick={forceRecalculateIntent}
          disabled={loadingIntent}
          className="text-[10px] uppercase font-mono tracking-widest text-[#73736e] hover:text-black hover:bg-stone-100 px-3 py-1.5 border border-[#e5e5e0] rounded-lg flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw size={11} className={loadingIntent ? "animate-spin" : ""} /> Review Intent Model
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e5e0]">
        
        {/* LEFT COLUMN: FRICTIONLESS ACQUISITION DEVICE SIMULATOR */}
        <div className="lg:col-span-6 p-6 space-y-6" id="frictionless-loader-panel">
          
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
              <Share2 size={13} className="text-stone-600" />
              <span>Frictionless Mobile Ingestion Simulator</span>
            </h3>
            <p className="text-[11px] text-[#73736e]">
              Humans are lazy. Real-world ingestion fails if it requires filling metadata fields. Tap any preset below to simulate sharing a resource from Instagram or Safari instantly.
            </p>
          </div>

          {/* Quick presets row */}
          <div className="space-y-3" id="acquisition-preset-stack">
            <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Curated High-Value Social Presets</span>
            
            <div className="grid grid-cols-1 gap-3.5">
              {SOURCE_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isThisExecuting = executingPresetId === preset.id;
                
                return (
                  <div 
                    key={preset.id}
                    className="border border-[#e5e5e0] group rounded-xl p-4 bg-white hover:border-black transition-all flex flex-col justify-between hover:shadow-xs relative"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[9px] font-bold font-mono rounded-md uppercase tracking-wide ${preset.color}`}>
                          <Icon size={11} /> {preset.display}
                        </span>
                        <span className="text-[9px] font-mono text-stone-400 font-medium truncate max-w-[200px]">
                          {preset.url}
                        </span>
                      </div>

                      <p className="text-xs text-stone-700 leading-normal font-medium">
                        {preset.label}
                      </p>
                      <p className="text-[11px] text-stone-500 italic leading-relaxed bg-[#fbfbfa] p-2 rounded-lg border border-dashed border-[#e5e5e0]">
                        &ldquo;{preset.text}&rdquo;
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#f0f0ed] flex items-center justify-between">
                      <span className="text-[10px] text-stone-400 font-mono">Zero effort share</span>
                      <button
                        onClick={() => triggerSimulationCapture(preset)}
                        disabled={isProcessing}
                        className={`text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 border hover:bg-stone-50 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                          isThisExecuting 
                            ? "bg-stone-100 text-stone-500 border-stone-200 cursor-not-allowed" 
                            : "bg-white text-stone-800 border-stone-300 hover:border-black active:scale-95 disabled:opacity-50"
                        }`}
                      >
                        {isThisExecuting ? (
                          <>
                            <RefreshCw size={11} className="animate-spin text-stone-500" />
                            <span>Sharing...</span>
                          </>
                        ) : (
                          <>
                            <Share2 size={11} className="text-stone-400 group-hover:text-black" />
                            <span>Simulate Instant Share</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Custom Linker form */}
          <div className="border border-[#e5e5e0] bg-[#fafaf9] rounded-xl p-4 space-y-3.5" id="custom-link-ingester-box">
            <span className="text-[9px] uppercase font-bold tracking-widest text-stone-700 font-mono block">Or Share a Custom Sandbox Bookmark</span>
            
            <form onSubmit={handleCustomIngestSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-[#73736e] font-bold uppercase font-mono block mb-1">Source Type</label>
                  <select 
                    value={selectedSourceType} 
                    onChange={(e) => setSelectedSourceType(e.target.value as any)}
                    className="w-full bg-white border border-[#e5e5e0] rounded-lg p-2 text-xs text-stone-800 focus:outline-none focus:border-stone-500"
                  >
                    <option value="github">GitHub Repository</option>
                    <option value="instagram">Instagram Reel</option>
                    <option value="youtube">YouTube transcript</option>
                    <option value="tweet">X / Twitter</option>
                    <option value="article">Website Link</option>
                    <option value="pdf">PDF Upload</option>
                    <option value="note">Plain text note</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-[#73736e] font-bold uppercase font-mono block mb-1">Target URL</label>
                  <input
                    type="text"
                    placeholder="E.g., https://gozora.io/demo"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="w-full bg-white border border-[#e5e5e0] rounded-lg p-2 text-xs focus:outline-none focus:border-stone-500 placeholder:text-stone-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] text-[#73736e] font-bold uppercase font-mono block mb-1">Context / User Thought Annotation</label>
                <textarea
                  rows={2}
                  placeholder="Paste manual excerpt, design note or specific tool context..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full bg-white border border-[#e5e5e0] rounded-lg p-2 text-xs focus:outline-none focus:border-stone-500 placeholder:text-stone-400"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || (!customUrl.trim() && !customNote.trim())}
                className="w-full bg-stone-900 hover:bg-black text-white py-2 select-none border border-stone-950 font-semibold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-40"
              >
                {isProcessing ? "Processing Custom Source..." : "Frictional-Free Ingest"}
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN: AI INTENT ENGINE & COGNITIVE ACTION PILLARS */}
        <div className="lg:col-span-6 p-6 space-y-6 flex flex-col justify-between bg-[#fafaf9]/20" id="intent-engine-output-panel">
          
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
                <Gauge size={13} className="text-stone-700" />
                <span>Computed Human Intent Matrix</span>
              </h3>
              <p className="text-[11px] text-[#73736e]">
                AI Brain watches ingestion habits in the background. It groups topics to automatically infer your ultimate goal and suggests structured layout folder splits.
              </p>
            </div>

            {loadingIntent ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <RefreshCw className="animate-spin text-stone-500" size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 font-mono">Calibrating implicit goal intent models...</span>
              </div>
            ) : intent ? (
              <div className="space-y-5" id="active-intent-metrics-readout">
                
                {/* Intent Statement box */}
                <div className="border border-[#e5e5e0] bg-white rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.01)] space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-stone-400 font-mono">Inferred Core Objective Intent</span>
                    <span className={`px-2 py-0.5 border text-[9px] font-bold font-mono rounded-md tracking-tight ${getScoreColor(intent.confidenceScore)}`}>
                      Confidence {intent.confidenceScore}%
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-black leading-snug">
                    👉 {intent.inferredGoal}
                  </h4>
                  <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                    {intent.reasoning}
                  </p>
                </div>

                {/* Sub-pillars breakdown */}
                <div className="space-y-3">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Ingest Volume Distribution Tracks</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="intent-pillars-subgrid">
                    {intent.identifiedPillars.map((pillar, idx) => (
                      <div key={idx} className="bg-white border border-[#e5e5e0] p-3.5 rounded-xl space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-stone-900 truncate">{pillar.title}</span>
                          <span className="px-1.5 py-0.5 bg-stone-100 text-stone-700 font-mono text-[9px] font-bold rounded">
                            {pillar.count} Nodes
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-500 leading-normal">{pillar.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggested project folders mapping user requirements */}
                <div className="space-y-2 bg-[#f6f6f3] border border-[#e5e5e0] rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1 text-stone-800">
                    <FolderOpen size={13} />
                    <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Suggested Workspace Folders</span>
                  </div>
                  
                  <p className="text-[11px] text-[#73736e]">
                    The intent engine suggests mapping resources inside these specialized structural projects to streamline retrieval. Already sync'd:
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {intent.suggestedProjects.map((proj, pIdx) => {
                      const alreadyCreated = projects.some(p => p.name.toLowerCase() === proj.toLowerCase());
                      return (
                        <div 
                          key={pIdx}
                          className={`inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-md border text-stone-700 transition-all font-semibold uppercase tracking-tight ${
                            alreadyCreated 
                              ? "bg-stone-200 border-stone-300 pointer-events-none text-stone-500" 
                              : "bg-white border-stone-300"
                          }`}
                        >
                          <ChevronRight size={10} className="text-stone-400" />
                          <span>{proj}</span>
                          {alreadyCreated && <span className="text-[9px] text-[#8c8c88]">(Sync'd)</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Roadmaps action items */}
                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Next Goal Roadmap Tasks</span>
                  
                  <ul className="space-y-2 text-[11px] text-stone-700">
                    {intent.suggestedActionItems.map((act, aIdx) => (
                      <li key={aIdx} className="flex items-start gap-2 leading-relaxed bg-white border border-[#e5e5e0] px-3 py-2 rounded-lg">
                        <CheckSquare size={13} className="text-stone-500 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 text-stone-400 text-xs font-mono">
                No active intent matrix processed. Ingest items to start calculating goal paths.
              </div>
            )}
          </div>

          {/* Realtime Process execution visual trace logs */}
          <div className="mt-6 border-t border-[#e5e5e0] pt-4 space-y-2.5" id="realtime-process-logs-trace">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] uppercase font-bold tracking-wider text-black font-mono flex items-center gap-1.5">
                <History size={12} className="text-zinc-500" />
                <span>Active External Acquisition & Intent Trace Logs</span>
              </span>
              <button 
                onClick={() => setPipelineLogs([])}
                className="text-[9px] text-stone-400 hover:text-black font-mono font-bold"
              >
                Clear logs
              </button>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-4 text-[10px] font-mono text-zinc-350 min-h-[140px] max-h-[140px] overflow-y-auto space-y-1.5 border border-black shadow-inner leading-relaxed scrollbar-thin">
              {pipelineLogs.length === 0 ? (
                <div className="text-stone-500 italic py-8 text-center bg-[#1e1e19]">
                  ~ Idle. Waiting for mobile Simulated Share clicks or document uploads...~
                </div>
              ) : (
                pipelineLogs.map((log, lIdx) => (
                  <div key={lIdx} className="whitespace-pre-wrap font-mono text-zinc-300">
                    <span className="text-[#8c8c88] select-none">&#62;</span> {log}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
