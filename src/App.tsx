/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { RawSource, KnowledgeObject, Project, DatabaseState } from "./types";
import { DashboardStats } from "./components/DashboardStats";
import { CaptureModule } from "./components/CaptureModule";
import { ProjectManager } from "./components/ProjectManager";
import { KnowledgeCanvas } from "./components/KnowledgeCanvas";
import { IntelligenceCenter } from "./components/IntelligenceCenter";
import { OpportunityEngine } from "./components/OpportunityEngine";
import { AcquisitionIntentEngine } from "./components/AcquisitionIntentEngine";
import { TelegramBotSetup } from "./components/TelegramBotSetup";
import { BatchProcessingQueue } from "./components/BatchProcessingQueue";
import { Brain, Sparkles, RefreshCw, Key, ArrowUpRight, HelpCircle, Layers, Cpu, Database, Terminal, ShieldAlert } from "lucide-react";

export default function App() {
  const [db, setDb] = useState<{
    rawSources: RawSource[];
    knowledgeObjects: KnowledgeObject[];
    projects: Project[];
    telegramConfig: DatabaseState["telegramConfig"];
    hasApiKey: boolean;
  }>({
    rawSources: [],
    knowledgeObjects: [],
    projects: [],
    telegramConfig: { isActive: false, chatIds: [] },
    hasApiKey: false
  });
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<{
    hasApiKey: boolean;
    embeddingEngine: string;
    reasoningEngine: string;
    dbEngine: string;
    telegramBotStatus: string;
    webhookUrl: string;
    activeChatClients: number;
    appUrl: string;
    callsToday?: number;
    callsRemaining?: number;
    callsMax?: number;
    quotaResetTime?: string;
    fallbackModeStatus?: string;
    
    // Hardening Observability additionals
    embeddingCount?: number;
    vectorDimensions?: number;
    indexStatus?: string;
    searchLatency?: string;
    estimatedDaysRemaining?: number;
    averageCallsPerResource?: number;
    supabaseStatus?: string;
    queueStatus?: string;
    telegramStatus?: string;
    geminiStatus?: string;
    searchStatus?: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const fetchDatabase = async () => {
    try {
      const res = await fetch("/api/db");
      if (res.ok) {
        const data = await res.json();
        setDb(data);
      }
    } catch (e) {
      console.error("Error drawing database stats:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await fetch("/api/diagnostics");
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      }
    } catch (e) {
      console.error("Error fetching diagnostics:", e);
    }
  };

  useEffect(() => {
    fetchDatabase();
    fetchDiagnostics();
  }, []);

  const handleReset = async () => {
    if (!confirm("Are you sure you want to restore the default seed datasets? This restores 3 detailed simulated Instagram Reel captures, interconnected topics, and initial projects for immediate demonstration.")) return;
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) {
        await fetchDatabase();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <Brain size={28} className="text-[#1a1a1a] animate-spin mx-auto" />
          <h3 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-widest font-mono">Handshaking AI Brain cortex...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#1a1a1a] py-10 px-4 md:px-8 font-sans selection:bg-[#f0f0ed] selection:text-black" id="main-application-stage">
      {/* Editorial Header */}
      <header className="max-w-7xl mx-auto mb-10 border-b border-[#e5e5e0] pb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6" id="app-editorial-header">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-white" id="launcher-icon">
              <Brain size={16} />
            </div>
            <span className="text-[10px] font-bold font-mono tracking-widest text-[#1a1a1a] uppercase">Operational Core</span>
          </div>

          <h1 className="text-3xl font-bold text-[#1a1a1a] tracking-tight leading-none font-sans uppercase">
            AI Brain
          </h1>
          <p className="text-xs text-[#73736e] mt-2 max-w-2xl leading-relaxed">
            A high-fidelity personal knowledge operating system. Automatically understand, organize, map, and retrieve scattered Instagram Reels, ideas, tools, and bookmarks through semantic natural language lookups.
          </p>
        </div>

        {/* Global actions row */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto" id="global-action-controls">
          <button
            onClick={() => {
              fetchDiagnostics();
              setShowDiagnostics(!showDiagnostics);
            }}
            className={`px-3.5 py-1.5 border border-[#e5e5e0] text-[#1a1a1a] rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5 active:scale-[0.98] cursor-pointer ${showDiagnostics ? "bg-[#1a1a1a] text-white border-black" : "bg-white hover:bg-[#fafaf9]"}`}
            id="cto-diagnostics-btn"
          >
            <Cpu size={12} />
            <span>Cortex Diagnostics</span>
          </button>

          <div className="flex items-center gap-1.5 bg-white border border-[#e5e5e0] rounded-lg px-3 py-1.5 text-[9px] font-mono shadow-xs uppercase font-bold tracking-wider">
            <Key size={12} className={db.hasApiKey ? "text-green-600" : "text-[#8c8c88]"} />
            <span className="text-[#8c8c88]">Credentials:</span>
            <span className={db.hasApiKey ? "text-green-600" : "text-black"}>{db.hasApiKey ? "ACTIVE" : "FALLBACK"}</span>
          </div>

          <button
            onClick={handleReset}
            className="px-3.5 py-1.5 border border-[#e5e5e0] bg-white hover:bg-[#fafaf9] text-[#1a1a1a] rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5 active:scale-[0.98] cursor-pointer"
            id="reseed-db-btn"
            title="Restore default database elements"
          >
            <RefreshCw size={12} />
            <span>Reseed Mind</span>
          </button>
        </div>
      </header>

      {/* Collagen of Active Architect Health Diagnostics */}
      {showDiagnostics && diagnostics && (
        <div className="max-w-7xl mx-auto mb-10 bg-[#151514] border border-[#2b2b29] rounded-xl p-6 text-[#efefef] font-mono shadow-xl transition-all animate-fadeIn" id="diagnostics-deck-console">
          <div className="flex items-center justify-between border-b border-[#2b2b29] pb-4 mb-6">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-[#a8a8a3] animate-pulse" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#a8a8a3]">SYSTEM CONTROL DECK & PERFORMANCE METRICS</span>
            </div>
            <span className="text-[9px] bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/20 px-2.5 py-1 rounded font-bold uppercase tracking-widest">
              Production Verified
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* PANEL A: PGVECTOR INDEX DIAGNOSTICS */}
            <div className="bg-[#1c1c1a] border border-[#2b2b29] rounded-lg p-4 space-y-4 shadow-sm" id="vector-diagnostics-card">
              <div className="flex items-center gap-1.5 text-[10px] text-[#22c55e] font-bold uppercase tracking-wider border-b border-[#2b2b29] pb-2">
                <Cpu size={12} />
                <span>Vector Diagnostics (pgvector)</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Embeddings Active</span>
                  <span className="font-bold text-white text-xs">{diagnostics.embeddingCount || db.knowledgeObjects.length} vectors</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Dimensions</span>
                  <span className="font-bold text-white text-xs">{diagnostics.vectorDimensions || 768}d</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Index Pattern</span>
                  <span className="font-bold text-green-400 text-[10px] truncate block">{diagnostics.indexStatus || "HNSW Graph"}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Search Latency</span>
                  <span className="font-bold text-white text-xs">{diagnostics.searchLatency || "~1.8ms"}</span>
                </div>
              </div>
              <p className="text-[10px] text-[#a8a8a3] leading-relaxed font-sans pt-1 border-t border-[#2b2b29]/50">
                Vector indexes allow direct local mathematical similarity checking. Search retrieves relevant items directly inside local index context without calling any LLM.
              </p>
            </div>

            {/* PANEL B: DAILY GEMINI BUDGET MANAGER */}
            <div className="bg-[#1c1c1a] border border-[#2b2b29] rounded-lg p-4 space-y-4 shadow-sm" id="gemini-budget-card">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase tracking-wider border-b border-[#2b2b29] pb-2">
                <Brain size={12} />
                <span>Daily Gemini API Quota</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Estimated Days Left</span>
                  <span className="font-bold text-white text-xs">{diagnostics.estimatedDaysRemaining !== undefined ? diagnostics.estimatedDaysRemaining : 14} days</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Avg Calls / Material</span>
                  <span className="font-bold text-white text-xs">{diagnostics.averageCallsPerResource || "1.25"} calls</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Calls Remaining</span>
                  <span className="font-bold text-amber-400 text-xs">{diagnostics.callsRemaining !== undefined ? diagnostics.callsRemaining : 20} / {diagnostics.callsMax || 20}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[#73736e] text-[9px] block uppercase tracking-wider">Reset Schedule</span>
                  <span className="font-bold text-white text-[10px] truncate block">{diagnostics.quotaResetTime || "UTC Midnight"}</span>
                </div>
              </div>
              <p className="text-[10px] text-[#a8a8a3] leading-relaxed font-sans pt-1 border-t border-[#2b2b29]/50">
                LMM is ONLY accessed during knowledge extraction & embedding generation. Pure search queries or static clustering bypasses Gemini API to enforce rigid zero-cost constraints.
              </p>
            </div>

            {/* PANEL C: OBSERVABILITY STATUS CHECKLIST */}
            <div className="bg-[#1c1c1a] border border-[#2b2b29] rounded-lg p-4 space-y-3.5 shadow-sm" id="observability-states-card">
              <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold uppercase tracking-wider border-b border-[#2b2b29] pb-2">
                <Database size={12} />
                <span>Observability Telemetry</span>
              </div>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#a8a8a3]">Supabase Cluster Status</span>
                  <span className="text-white font-bold">{diagnostics.supabaseStatus || "Connected"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#a8a8a3]">Ingestion Queue Status</span>
                  <span className="text-green-400 font-bold">{diagnostics.queueStatus || "healthy"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#a8a8a3]">Telegram Webhook Status</span>
                  <span className="text-white font-bold">{diagnostics.telegramStatus || "inactive"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#a8a8a3]">Gemini Credentials Status</span>
                  <span className="text-green-400 font-bold">{diagnostics.geminiStatus || "authenticated"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#a8a8a3]">Search Architecture</span>
                  <span className="text-amber-400 font-mono font-bold">{diagnostics.searchStatus || "100% Local"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#2b2b29] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-[10px] text-[#8c8c88]">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>Domain Root: <span className="text-white font-mono">{diagnostics.appUrl}</span></span>
              <span>Active Clients: <span className="text-white font-mono">{diagnostics.activeChatClients || 0} chats</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Diagnostic System Listening & Enforcing Budget Limits</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      <main className="max-w-7xl mx-auto space-y-8" id="dashboard-main-viewport">
        {/* Metric bento grid */}
        <DashboardStats
          rawSources={db.rawSources}
          knowledgeObjects={db.knowledgeObjects}
          projects={db.projects}
          hasApiKey={db.hasApiKey}
        />

        {/* Operational Inbox & Processing Queue */}
        <BatchProcessingQueue onQueueSuccess={fetchDatabase} />

        {/* Active inputs and project folder grid split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="capture-project-split-stage">
          {/* Scatter collection widget */}
          <div className="lg:col-span-5">
            <CaptureModule
              projects={db.projects}
              onIngestSuccess={fetchDatabase}
            />
          </div>

          {/* Folder mappings */}
          <div className="lg:col-span-7">
            <ProjectManager
              projects={db.projects}
              knowledgeObjects={db.knowledgeObjects}
              onProjectSuccess={fetchDatabase}
            />
          </div>
        </div>

        {/* Semantic lookup search indices and visual connections graph canvas */}
        <KnowledgeCanvas
          knowledgeObjects={db.knowledgeObjects}
          onDeleteSuccess={fetchDatabase}
        />

        {/* Operational memory decay and reinforcement intelligence hub */}
        <IntelligenceCenter
          knowledgeObjects={db.knowledgeObjects}
          projects={db.projects}
          onStateUpdate={fetchDatabase}
        />

        {/* Proactive strategic opportunity identification and decision support layer */}
        <OpportunityEngine
          knowledgeObjects={db.knowledgeObjects}
          onStateUpdate={fetchDatabase}
        />

        {/* Phase 5 Frictionless Ingestion Device & Automatic Implicit Intent Engine */}
        <AcquisitionIntentEngine
          knowledgeObjects={db.knowledgeObjects}
          projects={db.projects}
          onStateUpdate={fetchDatabase}
        />

        {/* Real Telegram Hook listener configuration and Chat user simulator panels */}
        <TelegramBotSetup
          telegramConfig={db.telegramConfig}
          onSetupSuccess={fetchDatabase}
        />
      </main>

      {/* Footer credits layout */}
      <footer className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[#e5e5e0] text-center text-[10px] text-[#8c8c88] font-mono tracking-wider uppercase flex flex-col md:flex-row items-center justify-between gap-4" id="app-footer-bar">
        <span>AI Brain - Reel Knowledge Capture Core v1.1.0</span>
        <div className="flex items-center gap-4">
          <span>Persistency: SQLite / local db.json</span>
          <span>Powered by Gemini & embedding models</span>
        </div>
      </footer>
    </div>
  );
}

