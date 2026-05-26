/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SourceType, Project } from "../types";
import { Link2, Sparkles, Loader2, ArrowRight, CheckCircle2, AlertTriangle, FileText, FileVideo, Twitter, HelpCircle } from "lucide-react";

interface CaptureProps {
  projects: Project[];
  onIngestSuccess: () => void;
}

export function CaptureModule({ projects, onIngestSuccess }: CaptureProps) {
  const [url, setUrl] = useState("");
  const [userNote, setUserNote] = useState("");
  const [selectedType, setSelectedType] = useState<SourceType>("instagram");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState(false);

  // Simple source detection based on URL change
  const handleUrlChange = (val: string) => {
    setUrl(val);
    const lower = val.toLowerCase();
    const githubRegex = /github\.com\/[\w.-]+\/[\w.-]+/i;
    const githubShorthandRegex = /^[\w.-]+\/[\w.-]+$/i;

    if (githubRegex.test(lower) || githubShorthandRegex.test(val.trim())) {
      setSelectedType("github");
    } else if (lower.includes("instagram.com/reel") || lower.includes("instagram.com/p")) {
      setSelectedType("instagram");
    } else if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
      setSelectedType("youtube");
    } else if (lower.includes("twitter.com") || lower.includes("x.com")) {
      setSelectedType("tweet");
    } else if (lower.includes(".pdf")) {
      setSelectedType("pdf");
    } else if (val.trim() !== "" && !val.startsWith("http")) {
      setSelectedType("note");
    } else if (val.startsWith("http")) {
      setSelectedType("article");
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !userNote.trim()) {
      setErrorStatus("Please provide a search link, URL, or plain commentary note to ingest.");
      return;
    }

    setLoading(true);
    setErrorStatus(null);
    setSuccessStatus(false);
    setSteps([
      "[INIT] Handshaking node connection.",
      "[WAIT] Queueing raw record on digital ledger."
    ]);

    try {
      // Trigger API ingestion pipeline
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: selectedType,
          url: url ? url.trim() : undefined,
          userNote: userNote ? userNote.trim() : "",
          rawText: `${url || ""} ${userNote || ""}`.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to trigger AI extractor");
      }

      const data = await res.json();
      
      // Load process steps
      if (data.steps && Array.isArray(data.steps)) {
        setSteps(data.steps);
      } else {
        setSteps([
          "[OK] Logged raw asset properties.",
          "[OK] Executed semantic decomposition algorithm.",
          "[OK] Saved to operational memory matrix."
        ]);
      }

      setSuccessStatus(true);
      setUrl("");
      setUserNote("");

      // Trigger standard audio or visual feedback
      import("canvas-confetti").then((conf) => {
        conf.default({ particleCount: 30, spread: 35, colors: ["#1a1a1a", "#73736e", "#8c8c88"] });
      });

      onIngestSuccess();
    } catch (err: any) {
      console.error(err);
      setErrorStatus(err.message || "Pipeline error");
      setSteps(prev => [...prev, `[CRITICAL_FAIL] ${err.message || "Pipeline interrupted"}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between" id="capture-module-card">
      <div id="capture-form-header">
        <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2 mb-1">
          <Sparkles className="text-[#1a1a1a]" size={15} />
          <span>Ingest Scatter Insights</span>
        </h2>
        <p className="text-xs text-[#73736e] mb-5 leading-tight font-sans">Paste social web URLs or text. Dynamic heuristic processing decants structured learning.</p>

        <form onSubmit={handleIngest} className="space-y-4">
          {/* Source Link input */}
          <div className="relative">
            <label className="text-[10px] font-bold text-[#8c8c88] tracking-wider uppercase block mb-1.5">Social Link / Web Resource</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-[#8c8c88]">
                <Link2 size={13} />
              </span>
              <input
                type="text"
                placeholder="https://instagram.com/reel/abc123..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="w-full bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-black focus:bg-white outline-none transition-all placeholder:text-[#8c8c88] font-mono"
                disabled={loading}
              />
            </div>
          </div>

          {/* User note context text */}
          <div>
            <label className="text-[10px] font-bold text-[#8c8c88] tracking-wider uppercase block mb-1.5">Context / Commentary Notes</label>
            <textarea
              placeholder="Why does this matter? Mention specific elements, ideas or future uses..."
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              rows={3}
              className="w-full bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded-lg p-3 text-xs focus:ring-1 focus:ring-black focus:bg-white outline-none transition-all placeholder:text-[#8c8c88] font-sans"
              disabled={loading}
            />
          </div>

          {/* Type of Content selector */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-[#8c8c88] tracking-wider uppercase block mb-1.5">Source Ingestion Type</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as SourceType)}
                className="w-full bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded-lg p-2 text-xs focus:ring-1 focus:ring-black cursor-pointer font-sans"
                disabled={loading}
              >
                <option value="instagram">Instagram Reel</option>
                <option value="youtube">YouTube Video</option>
                <option value="tweet">Tweet / X Idea</option>
                <option value="github">GitHub Repository</option>
                <option value="article">Article / Page</option>
                <option value="pdf">PDF Research</option>
                <option value="note">Plain Mind Note</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <button
                type="submit"
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider text-white shadow-xs flex items-center justify-center gap-1.5 transition-all ${
                  loading 
                    ? "bg-[#73736e] cursor-not-allowed" 
                    : "bg-[#1a1a1a] hover:bg-black active:scale-[0.98] cursor-pointer"
                }`}
                disabled={loading}
                id="submit-ingest-btn"
              >
                {loading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>Ingest to Brain</span>
                    <ArrowRight size={12} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Pipeline steps logs display */}
      <div className="mt-5 border-t border-[#e5e5e0] pt-4" id="pipeline-stream-block">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8c8c88] block mb-2">Cognitive Ingestion Pipeline Process</span>
        
        {steps.length > 0 ? (
          <div className="bg-[#1a1a1a] rounded-lg p-3 max-h-[140px] overflow-y-auto font-mono text-[10px] space-y-1.5 text-[#f0f0ed] shadow-inner">
            {steps.map((st, i) => {
              let colorClasses = "text-[#f0f0ed]";
              if (st.includes("FAILED") || st.includes("FAIL")) colorClasses = "text-red-400 font-bold";
              else if (st.includes("[5/5]") || st.includes("[OK]")) colorClasses = "text-emerald-400 font-bold";
              else if (st.startsWith("[INIT]") || st.startsWith("[WAIT]")) colorClasses = "text-stone-400";

              return (
                <div key={i} className="flex gap-1.5 leading-tight items-start">
                  <span className="text-[#8c8c88] select-none">❯</span>
                  <span className={colorClasses}>{st}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-[#e5e5e0] rounded-lg p-4 text-center text-[11px] text-[#8c8c88] italic font-mono">
            Awaiting URL input to initiate pipeline stream...
          </div>
        )}

        {/* User alert statuses */}
        {errorStatus && (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-2.5 flex items-center gap-1.5 text-[11px] text-red-600" id="capture-alert-error">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="font-sans leading-tight">{errorStatus}</span>
          </div>
        )}

        {successStatus && (
          <div className="mt-3 bg-[#fafaf9] border border-[#e5e5e0] rounded-lg p-2.5 flex items-center gap-1.5 text-[11px] text-[#1a1a1a]" id="capture-alert-success">
            <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
            <span className="font-mono leading-tight">Decomposition completed. Memory nodes indexed correctly.</span>
          </div>
        )}
      </div>
    </div>
  );
}

