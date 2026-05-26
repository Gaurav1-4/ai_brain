/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Brain, Heart, Sparkles, AlertCircle, RefreshCw, Layers, Sliders, Play, Check, TrendingUp, HelpCircle, FolderGit2, FolderClock } from "lucide-react";
import { MemoryStateIntelligence, KnowledgeObject, Project } from "../types";

interface IntelligenceCenterProps {
  knowledgeObjects: KnowledgeObject[];
  projects: Project[];
  onStateUpdate: () => void;
}

export function IntelligenceCenter({ knowledgeObjects, projects, onStateUpdate }: IntelligenceCenterProps) {
  const [intel, setIntel] = useState<MemoryStateIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"forgotten" | "weekly" | "projects" | "concepts">("forgotten");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [simulatingRecall, setSimulatingRecall] = useState<string | null>(null);
  const [successRecall, setSuccessRecall] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects]);

  const fetchIntelligence = async () => {
    try {
      const res = await fetch("/api/memory/intelligence");
      if (res.ok) {
        const data = await res.json();
        setIntel(data);
      }
    } catch (err) {
      console.error("Error drawing memory intelligence metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntelligence();
  }, [knowledgeObjects]);

  // Handle active memory reinforcement
  const handleReinforce = async (knowledgeId: string, eventType: "used" | "referenced" | "viewed") => {
    setSimulatingRecall(knowledgeId);
    try {
      const res = await fetch("/api/memory/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeId,
          eventType,
          context: "Active user manual recall review to halt cognitive memory decay."
        })
      });
      if (res.ok) {
        setSuccessRecall(knowledgeId);
        setTimeout(() => {
          setSuccessRecall(null);
          setSimulatingRecall(null);
        }, 1200);
        // Refresh both parent database and our intelligence hub
        onStateUpdate();
        fetchIntelligence();
      }
    } catch (err) {
      console.error("Error creating recall events:", err);
      setSimulatingRecall(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-8 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-center justify-center min-h-[220px]">
        <div className="text-center space-y-2">
          <Brain size={20} className="animate-pulse text-[#8c8c88] mx-auto" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Loading cognitive cortex calculations...</span>
        </div>
      </div>
    );
  }

  if (!intel) return null;

  // Active profile
  const activeProfile = intel.projectProfiles[selectedProjectId];

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)] overflow-hidden" id="memory-intelligence-center">
      {/* Editorial Dashboard Header */}
      <div className="p-6 border-b border-[#e5e5e0] bg-[#fafaf9] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2">
            <Brain className="text-[#1a1a1a]" size={16} />
            <span>Operational Memory Intelligence Hub</span>
          </h2>
          <p className="text-xs text-[#73736e]">Predicting context retention, monitoring cognitive decay curves, analyzing conceptual density, and scheduling reviews.</p>
        </div>

        {/* Cognitive Index Ticker */}
        <div className="flex items-center gap-4 text-xs">
          <div className="border border-[#e5e5e0] bg-white rounded-lg px-3 py-1.5 font-mono text-center">
            <span className="text-[10px] text-[#8c8c88] block uppercase font-bold leading-none mb-1">Cortex Retention</span>
            <span className="text-lg font-bold text-[#1a1a1a] tracking-tight">{intel.globalInsights.averageMemoryStrength}%</span>
          </div>
          <div className="border border-[#e5e5e0] bg-white rounded-lg px-3 py-1.5 font-mono text-center">
            <span className="text-[10px] text-[#8c8c88] block uppercase font-bold leading-none mb-1">Density Index</span>
            <span className="text-lg font-bold text-[#1a1a1a] tracking-tight">{intel.globalInsights.centralityIndex}/100</span>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-[#e5e5e0] overflow-x-auto text-xs bg-white" id="intelligence-tabbar">
        <button
          onClick={() => setActiveTab("forgotten")}
          className={`px-5 py-3.5 border-b-2 font-bold uppercase tracking-wider text-[10px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "forgotten"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-stone-50"
              : "border-transparent text-[#73736e] hover:text-[#1a1a1a]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <AlertCircle size={13} className="text-red-500" />
            Forgotten Detector ({intel.forgottenNodes.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab("weekly")}
          className={`px-5 py-3.5 border-b-2 font-bold uppercase tracking-wider text-[10px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "weekly"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-stone-50"
              : "border-transparent text-[#73736e] hover:text-[#1a1a1a]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-black" />
            Memory Review Engine
          </span>
        </button>

        <button
          onClick={() => setActiveTab("projects")}
          className={`px-5 py-3.5 border-b-2 font-bold uppercase tracking-wider text-[10px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "projects"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-stone-50"
              : "border-transparent text-[#73736e] hover:text-[#1a1a1a]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <FolderClock size={13} />
            Project Memory Profiles
          </span>
        </button>

        <button
          onClick={() => setActiveTab("concepts")}
          className={`px-5 py-3.5 border-b-2 font-bold uppercase tracking-wider text-[10px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "concepts"
              ? "border-[#1a1a1a] text-[#1a1a1a] bg-stone-50"
              : "border-transparent text-[#73736e] hover:text-[#1a1a1a]"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Layers size={13} />
            Centrality Index Map
          </span>
        </button>
      </div>

      {/* Pane Content views */}
      <div className="p-6 transition-all" id="intel-pane-view-box">
        
        {/* TAB 1: FORGOTTEN KNOWLEDGE DETECTOR */}
        {activeTab === "forgotten" && (
          <div className="space-y-5 animate-fade-in" id="forgotten-detector-panel">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-dashed border-[#e5e5e0] pb-4">
              <div>
                <h3 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚠️ Decay Risk Analysis</span>
                </h3>
                <p className="text-[11px] text-[#73736e] mt-1">Calculated mathematical decay representing high-actionability assets receiving zero recent access sessions.</p>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] text-[#73736e]">
                <span>Retention Warning Trigger: <strong className="text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded">&lt; 65% strength</strong></span>
              </div>
            </div>

            <div className="space-y-4" id="decaying-nodes-stack">
              {intel.forgottenNodes.map((node) => {
                const isSgActive = simulatingRecall === node.knowledgeId;
                const isSuccess = successRecall === node.knowledgeId;
                
                return (
                  <div key={node.knowledgeId} className="bg-[#fafaf9] border border-[#e5e5e0] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-[#1a1a1a] transition-all">
                    <div className="flex-1 space-y-1.5">
                      {/* Metric strength and project workspace identifier */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 bg-red-50 border border-red-100 text-red-600 font-bold font-mono rounded-md uppercase tracking-wide">
                          Strength: {node.memoryStrength}%
                        </span>
                        <span className="px-2 py-0.5 bg-white border border-[#e5e5e0] text-[#73736e] text-[9px] font-mono rounded">
                          📁 {node.projectText}
                        </span>
                      </div>

                      {/* Summary title */}
                      <h4 className="text-xs font-semibold text-[#1a1a1a] leading-relaxed">
                        {node.summary}
                      </h4>

                      {/* AI logic descriptor explanation */}
                      <p className="text-[10px] text-[#73736e] italic inline-flex items-center gap-1">
                        <AlertCircle size={10} className="text-[#8c8c88]" />
                        <span>{node.reasonToReview}</span>
                      </p>
                    </div>

                    {/* Operational triggers for interactive reinforcement loop */}
                    <div className="flex flex-wrap items-center gap-2" id={`ctrls-${node.knowledgeId}`}>
                      <button
                        onClick={() => handleReinforce(node.knowledgeId, "viewed")}
                        disabled={isSgActive}
                        className="px-2.5 py-1.5 bg-white border border-[#e5e5e0] hover:border-black hover:bg-[#fafaf9] text-[#1a1a1a] text-[9px] font-bold uppercase tracking-wide rounded-lg flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isSuccess ? <Check size={11} className="text-stone-700" /> : <Play size={10} />}
                        <span>Quick Review</span>
                      </button>

                      <button
                        onClick={() => handleReinforce(node.knowledgeId, "used")}
                        disabled={isSgActive}
                        className="px-3 py-1.5 bg-black text-white hover:bg-stone-800 text-[9px] font-bold uppercase tracking-wide rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSuccess ? <Check size={11} /> : <TrendingUp size={11} />}
                        <span>{isSgActive ? "Syncing..." : "Mark as Applied"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {intel.forgottenNodes.length === 0 && (
                <div className="border border-dashed border-[#e5e5e0] rounded-xl p-8 text-center text-xs text-[#8c8c88] font-mono">
                  <Check size={20} className="mx-auto mb-2 text-stone-700" />
                  Your mind cortex retention is pristine! All captured sources maintain healthy strength indices.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: WEEKLY MEMORY REVIEW ENGINE */}
        {activeTab === "weekly" && (
          <div className="space-y-5 animate-fade-in" id="weekly-review-panel">
            <div className="border-b border-dashed border-[#e5e5e0] pb-4">
              <h3 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                <span>📊 Automated Brain Synthesis Report</span>
              </h3>
              <p className="text-[11px] text-[#73736e] mt-1">Generated cognitive consolidation report summarizing weekly ingestion spikes and recommending retention topics.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="cons-report-matrix">
              {/* Report summary logs */}
              <div className="space-y-4">
                <div className="border border-[#e5e5e0] bg-[#fafaf9] rounded-xl p-4 space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono">Report Period: Last 7 Days</span>
                    <span className="px-1.5 py-0.5 bg-[#1a1a1a] text-white text-[8px] font-bold uppercase tracking-wider rounded font-mono">Dynamic</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-[#1a1a1a] font-sans">
                    <p className="leading-relaxed">
                      This past week, you ingested and organized <strong className="font-semibold text-black">{intel.weeklyReview.savedCount} highly valuable vector nodes</strong> into your operational AI Brain.
                    </p>

                    <p className="leading-relaxed">
                      Your dominant focus vector this cycle is clearly <strong className="font-semibold leading-relaxed text-black">#{intel.weeklyReview.topTopic}</strong>, showing an intensive exploration footprint.
                    </p>

                    <p className="leading-relaxed">
                      Your interest vectors are actively expanding into concepts containing: <strong className="font-semibold font-mono text-black">"{intel.weeklyReview.growingInterest}"</strong>.
                    </p>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] text-[#ffffff] rounded-xl p-4 border border-black shadow-sm flex items-start gap-3">
                  <div className="p-1.5 bg-stone-800 rounded-md shrink-0 text-white">
                    <Heart size={14} className="text-white animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono">Retention Metric Hint</span>
                    <p className="text-[11px] text-[#f0f0ed] leading-relaxed">
                      Recalling knowledge within 4-7 days of saving consolidates mental networks by over 80%. Apply or link objects to projects to secure long-term utility.
                    </p>
                  </div>
                </div>
              </div>

              {/* AI automated next-steps recommendation card */}
              <div className="border border-[#e5e5e0] rounded-xl p-5 space-y-4 bg-white hover:border-[#1a1a1a] transition-all flex flex-col justify-between">
                <div className="space-y-2.5">
                  <h4 className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono flex items-center gap-1">
                    <Sparkles size={11} className="text-black" />
                    <span>Brain Recommended Memory Reinforce</span>
                  </h4>

                  {intel.weeklyReview.forgottenRecommended ? (
                    <div className="space-y-3" id="weekly-rec-card-body">
                      <p className="text-xs text-[#1a1a1a] font-sans font-semibold leading-snug">
                        {intel.weeklyReview.forgottenRecommended.summary}
                      </p>
                      {intel.weeklyReview.forgottenRecommended.userNote && (
                        <p className="text-[11px] text-[#73736e] font-mono bg-[#f0f0ed] p-2 rounded border border-[#e5e5e0]">
                          📝 "{intel.weeklyReview.forgottenRecommended.userNote}"
                        </p>
                      )}
                      <p className="text-[11px] text-[#73736e]">
                        A brief access check or project linking of this resource would stop the immediate decay curve.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8c8c88] italic font-sans">No immediate recommendation matches located. Cortex patterns are stable!</p>
                  )}
                </div>

                {intel.weeklyReview.forgottenRecommended && (
                  <button
                    onClick={() => handleReinforce(intel.weeklyReview.forgottenRecommended!.knowledgeId, "referenced")}
                    disabled={simulatingRecall !== null}
                    className="w-full py-2 bg-stone-900 text-white rounded-lg hover:bg-black font-semibold uppercase tracking-wider text-[10px] text-center active:scale-95 transition-all text-sm block cursor-pointer"
                  >
                    🚀 Instantly Reinforce This Recommendation
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PROJECT MEMORY PROFILES */}
        {activeTab === "projects" && (
          <div className="space-y-5 animate-fade-in" id="project-memory-profiles-panel">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-dashed border-[#e5e5e0] pb-4">
              <div>
                <h3 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                  <span>📁 Dedicated Workspace Memory</span>
                </h3>
                <p className="text-[11px] text-[#73736e] mt-1">Explores project-aware memory structures tracking most referenced concepts, valuable tools, and emerging topics within individual branches.</p>
              </div>

              {/* Dropdown selector for active project memory profiling */}
              <div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="bg-[#f0f0ed] border border-[#e5e5e0] rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-black outline-none font-semibold cursor-pointer text-[#1a1a1a]"
                  id="project-selector-dropdown"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      📂 Workspace: {p.name}
                    </option>
                  ))}
                  {projects.length === 0 && (
                    <option value="">No Active Workspaces</option>
                  )}
                </select>
              </div>
            </div>

            {/* Profile Detail */}
            {activeProfile ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="project-profile-details-grid">
                {/* Metric profile block */}
                <div className="border border-[#e5e5e0] rounded-xl p-4 bg-[#fafaf9] space-y-4 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono">Project Workspace</span>
                    <h4 className="text-sm font-bold text-[#1a1a1a]">{activeProfile.projectName}</h4>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] text-[#8c8c88] block uppercase font-bold tracking-wider font-mono">Workspace Synergy Score</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-stone-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-black h-full rounded-full transition-all duration-500"
                          style={{ width: `${activeProfile.activeRelevanceScore}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-bold shrink-0">{activeProfile.activeRelevanceScore}%</span>
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-[#73736e] leading-snug font-sans border-t border-[#e5e5e0]">
                    Calculated synergy representing relative concentration index and aggregate memory weight of attached nodes.
                  </div>
                </div>

                {/* Overlaps & lists metrics block */}
                <div className="border border-[#e5e5e0] rounded-xl p-5 space-y-4 bg-white">
                  <h5 className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono">Active Conceptual Footprints</h5>
                  
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] text-[#8c8c88] font-semibold block uppercase">Linked Concepts</span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {activeProfile.mostReferencedConcepts.map(c => (
                          <span key={c} className="px-1.5 py-0.5 bg-[#f0f0ed] text-[#1a1a1a] font-mono text-[9px] rounded font-bold">
                            {c}
                          </span>
                        ))}
                        {activeProfile.mostReferencedConcepts.length === 0 && <span className="text-[10px] text-[#8c8c88] italic">Unlinked workspace</span>}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8c8c88] font-semibold block uppercase">Core Tools</span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {activeProfile.mostValuableTools.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-black text-white font-mono text-[9px] rounded font-bold">
                            {t}
                          </span>
                        ))}
                        {activeProfile.mostValuableTools.length === 0 && <span className="text-[10px] text-[#8c8c88] italic">None logged</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strongest memory nodes within this workspace */}
                <div className="border border-[#e5e5e0] rounded-xl p-5 space-y-4 bg-white">
                  <h5 className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono">Dominant Knowledge Hubs</h5>
                  
                  <div className="space-y-2.5">
                    {activeProfile.strongestKnowledgeNodes.map(node => (
                      <div key={node.knowledgeId} className="border-b border-[#fafaf9] pb-2 text-xs last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="px-1.5 py-0.2 bg-[#f0f0ed] text-black text-[9px] font-bold rounded">
                            {node.strength}% recall
                          </span>
                        </div>
                        <p className="text-[11px] text-[#1a1a1a] leading-tight line-clamp-2">{node.summary}</p>
                      </div>
                    ))}

                    {activeProfile.strongestKnowledgeNodes.length === 0 && (
                      <div className="text-center text-[10px] text-[#8c8c88] italic pt-4">No vector anchors mapped to this workspace folder. Ingest to sync state.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#8c8c88] italic">Awaiting project profile calculations for selection.</p>
            )}
          </div>
        )}

        {/* TAB 4: COGNITIVE BRAIN CENTRALITY MAP */}
        {activeTab === "concepts" && (
          <div className="space-y-5 animate-fade-in" id="cognitive-centrality-indexes-panel">
            <div className="border-b border-dashed border-[#e5e5e0] pb-4">
              <h3 className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                <span>🔗 Concept Hub Centrality Matrix</span>
              </h3>
              <p className="text-[11px] text-[#73736e] mt-1">Measuring co-occurrence densities across the memory network. Central tags receive a baseline importance multiplier inside search rankings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="centrality-density-stage">
              {/* Concept nodes scroller list */}
              <div className="md:col-span-7 border border-[#e5e5e0] rounded-xl bg-white p-4 space-y-3 max-h-[290px] overflow-y-auto" id="centrality-scroller-stack">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] mb-1 font-mono block">Analyzed Semantic Concepts</span>
                
                {intel.conceptsCentrality.map((item, idx) => (
                  <div key={item.concept} className="flex items-center justify-between border-b border-[#fafaf9] pb-2.5 last:border-none last:pb-0 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-[#8c8c88] w-4">#{idx + 1}</span>
                      <strong className="text-xs text-[#1a1a1a] font-mono">#{item.concept}</strong>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[10px] text-[#73736e] font-sans font-medium">{item.connectionsCount} links</span>
                      <span className="px-2 py-0.5 bg-[#f0f0ed] rounded text-[10px] font-mono font-bold text-[#1a1a1a]" title="Centrality Importance Weight Scale">
                        Weight: {item.importanceScore}
                      </span>
                    </div>
                  </div>
                ))}

                {intel.conceptsCentrality.length === 0 && (
                  <div className="text-center text-xs text-[#8c8c88] italic pt-6">Awaiting knowledge capture to analyze connected pathways</div>
                )}
              </div>

              {/* Centrality analysis explanation card */}
              <div className="md:col-span-5 bg-[#fafaf9] border border-[#e5e5e0] border-dashed rounded-xl p-5 flex flex-col justify-between" id="centrality-guidance-info">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8c8c88] font-mono flex items-center gap-1">
                    <HelpCircle size={12} />
                    <span>How Centrality Multipliers Work</span>
                  </h4>
                  <p className="text-[11px] text-[#73736e] leading-relaxed">
                    If an ingested note matches overlapping concepts and tags that appear elsewhere in your Mind Space, its centrality coefficient grows.
                  </p>
                  <p className="text-[11px] text-[#73736e] leading-relaxed">
                    Nodes with high centrality scores receive automatically boosted baseline weights. This resists sudden exponential recency decay, ensuring fundamental knowledge stays quickly retrievable and at hand.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#e5e5e0] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-black animate-pulse" />
                  <span className="text-[10px] uppercase font-bold text-[#1a1a1a] font-mono">Centrality analysis online</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
