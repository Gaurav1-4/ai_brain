/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { IngestionItem, KnowledgeCluster } from "../types";
import { 
  Inbox, 
  Layers, 
  Play, 
  Trash2, 
  TrendingUp, 
  Sparkles, 
  Cpu, 
  AlertCircle, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Flame, 
  HelpCircle,
  Wand2
} from "lucide-react";

interface QueueProps {
  onQueueSuccess: () => void;
}

export function BatchProcessingQueue({ onQueueSuccess }: QueueProps) {
  const [queue, setQueue] = useState<IngestionItem[]>([]);
  const [clusters, setClusters] = useState<KnowledgeCluster[]>([]);
  const [metrics, setMetrics] = useState({
    queuedCount: 0,
    processingCount: 0,
    processedCount: 0,
    failedCount: 0,
    totalCount: 0,
    budgetCallsToday: 0,
    budgetCallsMax: 20,
    budgetCallsRemaining: 20,
    isQuotaExceeded: false
  });
  const [processing, setProcessing] = useState(false);
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const [nightlyActive, setNightlyActive] = useState(false);

  // Load queue states
  const refreshQueueState = async () => {
    try {
      const res = await fetch("/api/queue");
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
        setClusters(data.clusters || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (e) {
      console.error("Error loading queue specs:", e);
    }
  };

  useEffect(() => {
    refreshQueueState();
    const timer = setInterval(refreshQueueState, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleAction = async (action: "process_one" | "process_10" | "process_all" | "cluster_only") => {
    setProcessing(true);
    setProcessLogs([`[Launcher] Handshaking batch process controller with action: ${action}...`]);
    try {
      const res = await fetch("/api/queue/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.steps) {
        setProcessLogs(data.steps);
      }
      await refreshQueueState();
      onQueueSuccess();
    } catch (err: any) {
      setProcessLogs(p => [...p, `[CRITICAL ERROR] Failed during request execution: ${err.message}`]);
    } finally {
      setProcessing(false);
    }
  };

  const handlePriorityCycle = async (id: string, current: "low" | "normal" | "high") => {
    const nextMap: Record<string, "low" | "normal" | "high"> = {
      low: "normal",
      normal: "high",
      high: "low"
    };
    const nextPriority = nextMap[current] || "normal";
    try {
      const res = await fetch(`/api/queue/${id}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: nextPriority })
      });
      if (res.ok) {
        await refreshQueueState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await refreshQueueState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetQueue = async () => {
    if (!confirm("Are you sure you want to completely clear the sandbox Inbox queue? This removes all unprocessed captures.")) return;
    try {
      const res = await fetch("/api/queue/reset", {
        method: "POST"
      });
      if (res.ok) {
        setProcessLogs([`[System] Inbox queue wiped clean.`]);
        await refreshQueueState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Scheduled Nightly Processing Simulation Toggle
  const toggleNightly = () => {
    setNightlyActive(!nightlyActive);
    if (!nightlyActive) {
      setProcessLogs(p => [...p, `[Cron Scheduler] Simulated Nightly Processing daemon ACTIVE. Will execute automatic batch compiler at 02:00 AM UTC.`]);
    } else {
      setProcessLogs(p => [...p, `[Cron Scheduler] Simulated cron deactivated.`]);
    }
  };

  // Helpers for styling
  const getSourceIcon = (type: string) => {
    switch (type) {
      case "instagram": return "📸";
      case "youtube": return "📺";
      case "github": return "💻";
      case "pdf": return "📄";
      case "article": return "📰";
      case "website": return "🌐";
      case "linkedin": return "👔";
      case "tweet": return "🐦";
      default: return "💡";
    }
  };

  const getPriorityStyle = (p: string) => {
    switch (p) {
      case "high": return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
      case "low": return "bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100";
      default: return "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100";
    }
  };

  const getStatusStyle = (s: string) => {
    switch (s) {
      case "processing": return "text-[#d97706] bg-[#fef3c7] animate-pulse";
      case "processed": return "text-emerald-700 bg-emerald-100";
      case "failed": return "text-rose-700 bg-rose-100";
      default: return "text-neutral-500 bg-neutral-100";
    }
  };

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]" id="batch-ingestion-control-center">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#f0f0ed] pb-5 mb-5" id="queue-header-box">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2">
            <Inbox className="text-[#1a1a1a]" size={16} />
            <span>Operational Inbox & Processing Queue</span>
          </h2>
          <p className="text-xs text-[#73736e] mt-1 font-sans">
            Capture reels & notes instantly with zero cost. Deduplicate and compile identical tools or topics into smart local clusters before invoking rare Gemini synthesis.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto" id="queue-budget-badge-dock">
          <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-lg px-3 py-1.5 text-right font-mono text-[10px]">
            <div className="text-[#8c8c88] text-[9px] uppercase font-bold tracking-wider">Gemini Free Budget</div>
            <div className={`font-bold mt-0.5 ${metrics.isQuotaExceeded ? "text-red-600" : "text-emerald-700"}`}>
              {metrics.budgetCallsRemaining} / {metrics.budgetCallsMax} Daily Calls Left
            </div>
          </div>
        </div>
      </div>

      {/* OS Metrics Grid Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" id="inbox-metrics-tiles">
        <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-lg p-3.5 flex flex-col justify-between" id="metric-queued">
          <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Inbox Queued</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-semibold text-[#1a1a1a] tracking-tight">{metrics.queuedCount}</span>
            <span className="text-stone-400 text-xs font-mono">cards</span>
          </div>
          <p className="text-[10px] text-[#73736e] mt-2 font-sans italic">Instant capture, zero API cost</p>
        </div>

        <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-lg p-3.5 flex flex-col justify-between" id="metric-processing">
          <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Active Processing</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className={`text-3xl font-semibold text-[#1a1a1a] tracking-tight ${metrics.processingCount > 0 ? "animate-pulse text-amber-600" : ""}`}>{metrics.processingCount}</span>
            <span className="text-stone-400 text-xs font-mono">running</span>
          </div>
          <p className="text-[10px] text-[#73736e] mt-2 font-sans italic">Synthesizing cluster assets</p>
        </div>

        <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-lg p-3.5 flex flex-col justify-between" id="metric-completed">
          <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Completed Batches</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-semibold text-emerald-700 tracking-tight">{metrics.processedCount}</span>
            <span className="text-stone-400 text-xs font-mono">extracted</span>
          </div>
          <p className="text-[10px] text-[#73736e] mt-2 font-sans italic">Mapped to persistent memory</p>
        </div>

        <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-lg p-3.5 flex flex-col justify-between" id="metric-failed">
          <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Failed / Retry</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className={`text-3xl font-semibold tracking-tight ${metrics.failedCount > 0 ? "text-red-600" : "text-stone-400"}`}>{metrics.failedCount}</span>
            <span className="text-stone-400 text-xs font-mono">errors</span>
          </div>
          <p className="text-[10px] text-[#73736e] mt-2 font-sans italic">Fallback engine overrides active</p>
        </div>
      </div>

      {/* SMART LOCAL CLUSTERS VIEWER (DEDUPLICATION ENGINE EXPLANATION) */}
      <div className="mb-6 bg-amber-50/50 border border-amber-200/60 rounded-xl p-5" id="smart-clusters-viewer">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-[#b45309]" />
            <h3 className="text-xs font-bold text-[#b45309] uppercase tracking-wider font-mono">Smart Ingestion Clusters ({clusters.length})</h3>
          </div>
          <span className="text-[9px] bg-amber-100 text-[#b45309] border border-amber-200 font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono">
            Anti-API Slop Deduplication Active
          </span>
        </div>

        {clusters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="clusters-grid">
            {clusters.map((cl) => (
              <div key={cl.id} className="bg-white border border-[#e5e5e0] hover:border-[#b45309]/50 transition-all rounded-lg p-3.5 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-neutral-800 leading-tight block">{cl.topic}</span>
                    <span className="text-[9px] bg-[#f0f0ed] text-stone-600 font-mono font-bold px-1.5 py-0.5 rounded leading-none shrink-0">
                      {cl.itemIds.length} items grouped
                    </span>
                  </div>
                  <p className="text-[10px] text-[#73736e] mt-1.5 leading-snug">{cl.clusterSummary}</p>
                </div>
                <div className="mt-3.5 pt-2 border-t border-[#f0f0ed] flex items-center justify-between text-[10px] font-mono text-stone-400">
                  <span className="flex items-center gap-1"><Cpu size={10} /> 1 API Call Saved: {cl.itemIds.length - 1} calls</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-1 py-0.2 rounded text-[8px] uppercase">Ready to compile</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-stone-200 border-dashed rounded-lg p-6 py-8 text-center" id="empty-clusters-placeholder">
            <span className="text-2xl block mb-2">🧘‍♀️</span>
            <p className="text-xs font-semibold text-neutral-500 leading-tight">No processing clusters required.</p>
            <p className="text-[10px] text-[#8c8c88] mt-1 max-w-md mx-auto leading-relaxed">
              When items collect in your Inbox, our deterministic local scanner will automatically group them here into logical research topics before triggering Gemini.
            </p>
          </div>
        )}
      </div>

      {/* CORE STRATEGY ACTION CONTROLS */}
      <div className="flex flex-wrap gap-2.5 mb-6" id="queue-trigger-actions">
        <button
          onClick={() => handleAction("process_one")}
          disabled={processing || metrics.queuedCount === 0}
          className="bg-[#1a1a1a] hover:bg-neutral-800 text-white disabled:bg-neutral-200 disabled:text-neutral-400 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none cursor-pointer"
          title="Process the next logical cluster topic group"
        >
          <Play size={12} className={processing ? "animate-spin" : ""} />
          <span>Process Top Group</span>
        </button>

        <button
          onClick={() => handleAction("process_10")}
          disabled={processing || metrics.queuedCount === 0}
          className="bg-white hover:bg-neutral-50 text-neutral-800 border border-[#e5e5e0] disabled:bg-[#fcfcfc] disabled:text-neutral-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none cursor-pointer"
          title="Compile up to 10 stacked sources"
        >
          <Wand2 size={12} />
          <span>Process 10</span>
        </button>

        <button
          onClick={() => handleAction("process_all")}
          disabled={processing || metrics.queuedCount === 0}
          className="bg-white hover:bg-neutral-50 text-neutral-800 border border-[#e5e5e0] disabled:bg-[#fcfcfc] disabled:text-neutral-300 font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none cursor-pointer"
          title="Process the complete operational queue in smart clusters"
        >
          <Layers size={12} />
          <span>Process All Clusters</span>
        </button>

        <button
          onClick={toggleNightly}
          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5 cursor-pointer outline-none ${nightlyActive ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-[#e5e5e0] text-[#73736e]"}`}
          title="Simulate nightly automated queue processor check"
        >
          <Clock size={12} className={nightlyActive ? "animate-pulse" : ""} />
          <span>{nightlyActive ? "Nightly Active (02:00 UTC)" : "Simulate Nightly Cron"}</span>
        </button>

        <button
          onClick={handleResetQueue}
          disabled={queue.length === 0 || processing}
          className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-transparent bg-rose-50 hover:bg-rose-100 text-rose-700 ml-auto transition-all flex items-center gap-1.5 outline-none cursor-pointer disabled:text-neutral-400 disabled:bg-neutral-100"
          title="Flush the capture queue"
        >
          <Trash2 size={12} />
          <span>Empty Queue</span>
        </button>
      </div>

      {/* PROCESS RUN LOGS DISPLAY */}
      {processLogs.length > 0 && (
        <div className="mb-6 bg-black text-[#58ff9c] font-mono p-4 rounded-lg text-[10px] leading-relaxed max-h-48 overflow-y-auto shadow-inner" id="queue-execution-terminal">
          <div className="flex items-center justify-between border-b border-[#222] pb-1.5 mb-2.5 text-stone-500 font-bold uppercase text-[9px] tracking-widest">
            <span className="flex items-center gap-1"><Cpu size={10} /> Batch Processor Trace Terminal</span>
            <button onClick={() => setProcessLogs([])} className="text-neutral-600 hover:text-white transition-all">Clear Terminal</button>
          </div>
          {processLogs.map((log, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-stone-600 select-none">&gt;</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      )}

      {/* DETAILED QUEUE INGESTION LIST */}
      <div>
        <h3 className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
          <Calendar size={13} />
          <span>Pending Inbox Raw Feed ({queue.length})</span>
        </h3>

        {queue.length > 0 ? (
          <div className="border border-[#e5e5e0] rounded-lg overflow-hidden" id="queue-items-table">
            <div className="bg-[#fafaf9] border-b border-[#e5e5e0] px-4 py-2 grid grid-cols-12 gap-2 text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider">
              <div className="col-span-1">Source</div>
              <div className="col-span-5">Raw Capture Detail / URL</div>
              <div className="col-span-2 text-center">Priority</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-right">Captured At</div>
            </div>

            <div className="divide-y divide-[#e5e5e0] max-h-72 overflow-y-auto" id="queue-items-rows">
              {queue.map((item) => (
                <div key={item.id} className="px-4 py-3 grid grid-cols-12 gap-2 text-xs items-center hover:bg-neutral-50 transition-all font-sans">
                  {/* Icon */}
                  <div className="col-span-1 text-base relative" title={item.sourceType}>
                    {getSourceIcon(item.sourceType)}
                  </div>

                  {/* Body Content */}
                  <div className="col-span-5">
                    {item.sourceUrl ? (
                      <a 
                        href={item.sourceUrl} 
                        target="_blank" 
                        rel="referrer" 
                        referrerPolicy="no-referrer"
                        className="text-[11px] text-[#1a1a1a] hover:underline block font-mono leading-normal break-all"
                      >
                        {item.sourceUrl}
                      </a>
                    ) : (
                      <span className="text-[11px] text-[#1a1a1a] block font-mono font-semibold">Plain commentary node</span>
                    )}
                    {item.userNote && (
                      <span className="text-[10px] text-[#73736e] block mt-0.5 leading-normal truncate font-sans">
                        Thoughts: "{item.userNote}"
                      </span>
                    )}
                    {item.sourceType === "github" && (item as any).repoMetadata && (
                      <span className="text-[9px] text-[#34d399] bg-[#065f46] border border-[#047857] px-1 py-0.2 rounded mt-1 font-mono leading-none inline-block uppercase">
                        Structure fingerprint indexed locally (stars: {((item as any).repoMetadata as any).stars})
                      </span>
                    )}
                    {item.failureReason && (
                      <span className="text-[9px] text-red-600 block leading-tight font-mono mt-0.5">
                        Error: {item.failureReason}
                      </span>
                    )}
                  </div>

                  {/* Priority click-to-cycle */}
                  <div className="col-span-2 text-center font-mono">
                    <button
                      onClick={() => handlePriorityCycle(item.id, item.priority)}
                      className={`px-2 py-0.5 border rounded text-[9px] font-bold uppercase transition-all tracking-wide cursor-pointer outline-none ${getPriorityStyle(item.priority)}`}
                      title="Click to cycle priority levels"
                    >
                      {item.priority}
                    </button>
                  </div>

                  {/* Status */}
                  <div className="col-span-2 text-center font-mono text-[10px]">
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase leading-none inline-block ${getStatusStyle(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  {/* Captured date & action button on hover */}
                  <div className="col-span-2 text-right text-[10px] text-[#8c8c88] font-mono flex items-center justify-end gap-2.5">
                    <span>{new Date(item.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-[#8c8c88] hover:text-red-600 p-1 hover:bg-neutral-100 rounded transition-all outline-none cursor-pointer"
                      title="Drop from queue"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#fafaf9] border border-[#e5e5e0] text-center rounded-lg p-8 py-10" id="empty-queue-cards-placeholder">
            <span className="text-3xl block mb-2.5">📦</span>
            <p className="text-xs font-semibold text-neutral-500">Your Operational Inbox queue is empty.</p>
            <p className="text-[10px] text-[#8c8c88] mt-1 max-w-sm mx-auto leading-relaxed font-sans">
              Paste clipboard URLs or share clips to enque them instantly. They will stack up here safely for smart, bulk, single-call compile processing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
