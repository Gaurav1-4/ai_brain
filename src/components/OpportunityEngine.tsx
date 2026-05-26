/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Compass, 
  HelpCircle, 
  Cpu, 
  Shuffle, 
  TrendingUp, 
  BookOpen, 
  Layers, 
  CheckCircle2, 
  ArrowUpRight, 
  Brain, 
  Activity, 
  GitMerge, 
  Inbox, 
  Calendar,
  Zap,
  ChevronRight,
  RefreshCw,
  Search
} from "lucide-react";
import { Opportunity, DecisionSupportResponse, KnowledgeObject } from "../types";

interface OpportunityEngineProps {
  knowledgeObjects: KnowledgeObject[];
  onStateUpdate: () => void;
}

export function OpportunityEngine({ knowledgeObjects, onStateUpdate }: OpportunityEngineProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [decision, setDecision] = useState<DecisionSupportResponse | null>(null);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [loadingDecision, setLoadingDecision] = useState(false);
  
  // Interactive strategy panel tabs
  const [activeSegment, setActiveSegment] = useState<"opportunities" | "decision">("opportunities");
  
  // User input message for cognitive inquiry
  const [customInquiry, setCustomInquiry] = useState("");
  const [activeQueryText, setActiveQueryText] = useState("What should I focus on this week?");
  
  // Action state feedback
  const [actingOnOpp, setActingOnOpp] = useState<string | null>(null);
  const [reinforcedOpps, setReinforcedOpps] = useState<string[]>([]);

  // Fetch opportunities from server
  const fetchOpportunities = async () => {
    setLoadingOpps(true);
    try {
      const res = await fetch("/api/memory/opportunities");
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data);
      }
    } catch (err) {
      console.error("Error executing cognitive opportunities fetch:", err);
    } finally {
      setLoadingOpps(false);
    }
  };

  // Fetch decision partner logic
  const fetchDecisionSupport = async (queryText: string) => {
    setLoadingDecision(true);
    try {
      const res = await fetch("/api/memory/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText })
      });
      if (res.ok) {
        const data = await res.json();
        setDecision(data);
        setActiveQueryText(queryText);
      }
    } catch (err) {
      console.error("Error fetching decision support prioritization:", err);
    } finally {
      setLoadingDecision(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
    fetchDecisionSupport("What should I focus on this week?");
  }, [knowledgeObjects]);

  // Accelerate / Reinforce Action handler
  const handleApplyOpportunity = async (oppId: string, relatedIds: string[]) => {
    setActingOnOpp(oppId);
    try {
      // Send sequential 'used' / 'referenced' events to the backend for each related knowledge ID!
      // This increases their memory strength index dynamically!
      await Promise.all(
        relatedIds.map(id =>
          fetch("/api/memory/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              knowledgeId: id,
              eventType: "used",
              context: `Consolidated via Phase 4 Opportunity Engine sequence: ${oppId}`
            })
          })
        )
      );
      
      setReinforcedOpps(prev => [...prev, oppId]);
      onStateUpdate(); // refreshing parent lists
      setTimeout(() => {
        setActingOnOpp(null);
      }, 1000);
    } catch (err) {
      console.error("Error reinforcing related knowledge nodes: ", err);
      setActingOnOpp(null);
    }
  };

  // Icon type mapper helper
  const renderOppTypeBadge = (type: string) => {
    switch (type) {
      case "Startup":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <Cpu size={11} /> Startup Concept
          </span>
        );
      case "Learning":
      case "Skill":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <BookOpen size={11} /> Skill Gap Mapped
          </span>
        );
      case "Project":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <TrendingUp size={11} /> Project Accelerator
          </span>
        );
      case "Research":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <Compass size={11} /> Research Rediscovery
          </span>
        );
      case "Automation":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <Shuffle size={11} /> Automation Integration
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-stone-100 border border-stone-200 text-stone-700 font-bold text-[9px] font-mono rounded-md uppercase tracking-wider">
            <Zap size={11} /> Strategic Opportunity
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)] overflow-hidden" id="opportunity-intelligence-layer">
      
      {/* Editorial Dashboard Banner */}
      <div className="p-6 border-b border-[#e5e5e0] bg-[#fafaf9] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-black text-white text-[8px] font-bold uppercase tracking-widest font-mono rounded">Phase 4</span>
            <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2">
              <Compass className="text-black animate-spin-slow" size={16} />
              <span>Proactive Opportunity Intelligence Engine</span>
            </h2>
          </div>
          <p className="text-xs text-[#73736e]">Fusing memorized patterns, analyzing topic clusters, uncovering research gaps, and serving dynamic strategic recommendations.</p>
        </div>

        {/* Engine mode switcher */}
        <div className="flex items-center bg-[#f0f0ed] border border-[#e5e5e0] p-1 rounded-lg self-start md:self-auto">
          <button
            onClick={() => setActiveSegment("opportunities")}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeSegment === "opportunities"
                ? "bg-white text-black shadow-xs"
                : "text-[#73736e] hover:text-black"
            }`}
          >
            Opportunities
          </button>
          <button
            onClick={() => setActiveSegment("decision")}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeSegment === "decision"
                ? "bg-white text-black shadow-xs"
                : "text-[#73736e] hover:text-black"
            }`}
          >
            Decision Support
          </button>
        </div>
      </div>

      {activeSegment === "opportunities" ? (
        /* SEGMENT 1: OPPORTUNITY STREAM */
        <div className="p-6 space-y-6" id="opportunities-stream-segment">
          
          {/* Static Mini-Insight Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="cortex-summary-row">
            <div className="border border-[#e5e5e0] rounded-xl p-4 bg-[#fbfbfa] flex items-start gap-3">
              <div className="p-2 bg-stone-100 rounded-lg shrink-0">
                <Layers size={14} className="text-stone-700" />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Ingestion Vectors</span>
                <span className="text-lg font-bold text-[#1a1a1a] tracking-tight block">{knowledgeObjects.length} Nodes</span>
                <span className="text-[10px] text-[#73736e] leading-normal block">Total active conceptual blocks registered in the cognitive index.</span>
              </div>
            </div>

            <div className="border border-[#e5e5e0] rounded-xl p-4 bg-[#fbfbfa] flex items-start gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg shrink-0 border border-emerald-100">
                <Zap size={14} className="text-emerald-700" />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Action Potential</span>
                <span className="text-lg font-bold text-emerald-800 tracking-tight block">92.4%</span>
                <span className="text-[10px] text-[#73736e] leading-normal block">Computed synergy multiplier based on overlapping tools.</span>
              </div>
            </div>

            <div className="border border-[#e5e5e0] rounded-xl p-4 bg-[#fbfbfa] flex items-start gap-3">
              <div className="p-2 bg-purple-50 rounded-lg shrink-0 border border-purple-100">
                <Activity size={14} className="text-purple-700 font-bold" />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#8c8c88] font-mono block">Clustering Density</span>
                <span className="text-lg font-bold text-purple-800 tracking-tight block">{opportunities.length} Active Hubs</span>
                <span className="text-[10px] text-[#73736e] leading-normal block">Automated clusters calculated dynamically from semantic proximity.</span>
              </div>
            </div>
          </div>

          <div className="border-b border-dashed border-[#e5e5e0] pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black flex items-center justify-between">
              <span>💡 Mapped Strategic Recommendations</span>
              <button 
                onClick={fetchOpportunities}
                className="text-[10px] uppercase font-mono tracking-widest text-[#73736e] hover:text-black flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw size={11} className={loadingOpps ? "animate-spin" : ""} /> Refresh Insights
              </button>
            </h3>
          </div>

          {loadingOpps ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <Brain size={24} className="animate-pulse text-stone-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-[#8c8c88]">Clustering memory vectors...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="opportunities-matrix-cards">
              {opportunities.map((opp) => {
                const isActing = actingOnOpp === opp.id;
                const isSuccess = reinforcedOpps.includes(opp.id);
                
                return (
                  <div 
                    key={opp.id} 
                    className={`border rounded-xl p-5 bg-white transition-all duration-300 hover:border-black flex flex-col justify-between gap-5 relative group ${
                      isSuccess ? "border-stone-400 bg-stone-50/40" : "border-[#e5e5e0] shadow-[0_2px_4px_rgba(0,0,0,0.01)]"
                    }`}
                  >
                    {/* Upper content */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        {renderOppTypeBadge(opp.opportunityType)}
                        <span className="font-mono text-[10px] font-bold text-stone-500 bg-[#fbfbfa] px-2 py-0.5 border border-[#e5e5e0] rounded-md tracking-tight">
                          Confidence {opp.confidenceScore}%
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-[#1a1a1a] leading-snug tracking-tight group-hover:text-black mt-2">
                        {opp.title}
                      </h4>

                      <p className="text-xs text-[#73736e] leading-relaxed">
                        {opp.description}
                      </p>
                    </div>

                    {/* Meta info & Action trigger footer */}
                    <div className="border-t border-[#f0f0ed] pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] font-mono">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[#8c8c88] uppercase font-semibold">Connections:</span>
                        {opp.relatedKnowledgeIds.map(kid => (
                          <span key={kid} className="px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded text-[9px]">
                            #{kid}
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={() => handleApplyOpportunity(opp.id, opp.relatedKnowledgeIds)}
                        disabled={isActing}
                        className={`px-3 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto ${
                          isSuccess
                            ? "bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed"
                            : "bg-black text-white hover:bg-stone-800 border-black active:scale-95"
                        }`}
                      >
                        {isSuccess ? (
                          <>
                            <CheckCircle2 size={11} className="text-stone-500" />
                            <span>Aligned</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpRight size={11} />
                            <span>{isActing ? "Snycing..." : "Reinforce Core Link"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {opportunities.length === 0 && (
                <div className="md:col-span-2 text-center py-12 border border-dashed border-[#e5e5e0] rounded-xl text-xs text-[#8c8c88] font-mono">
                  <Inbox className="mx-auto mb-2 text-stone-400" size={18} />
                  Ingest source documents to calculate pattern matching matrices.
                </div>
              )}
            </div>
          )}

          {/* Core Pattern Discovery Report Panel */}
          <div className="bg-[#1a1a1a] text-[#ffffff] rounded-xl p-6 border border-black shadow-sm space-y-4" id="weekly-momentum-bulletin">
            <div className="flex items-center gap-2 pb-1.5 border-b border-stone-800">
              <Calendar size={15} className="text-white" />
              <h4 className="text-[10px] font-bold tracking-widest uppercase font-mono text-white">Consolidated Weekly Opportunity Bulletin</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs leading-relaxed" id="bulletin-matrix-points">
              <div className="space-y-1">
                <span className="font-mono text-[9px] text-[#8c8c88] uppercase font-bold block">1. Explored Momentum</span>
                <p className="text-stone-300 font-light">
                  Mathematical graph clusters represent active exploration into design systems vertical align layouts and Express SQLite pipeline scaffolding templates.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-mono text-[9px] text-[#8c8c88] uppercase font-bold block">2. Dormant Unused Goldmines</span>
                <p className="text-stone-300 font-light">
                  You saved critical Supabase Row Level Security security rules guidelines 3 days ago. Linking this reference to Gozora immediately resolves database connection drafts.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-mono text-[9px] text-[#8c8c88] uppercase font-bold block">3. Suggested Immediate Sprint</span>
                <p className="text-stone-300 font-light">
                  Build a unified full-stack state sync MVP deploying Lovable UI schemas tied to Bolt Typescript backend services.
                </p>
              </div>
            </div>
          </div>

        </div>
      ) : (
        /* SEGMENT 2: CONVERSATIONAL DECISION PARTNER */
        <div className="p-6 space-y-6" id="conversational-decision-segment">
          
          {/* Query Formulation Input Bar */}
          <div className="space-y-4 border-b border-[#f0f0ed] pb-6" id="decision-query-formulation-box">
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                <Brain size={14} /> Talk to your Cognitive Decision Partner
              </h3>
              <p className="text-xs text-[#73736e]">Query your complete operational mind graph. Ask for focuses, prioritization weights, career goals, or technical stacks combinations.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="relative flex-1 w-full">
                <span className="absolute left-3 top-3.5 text-stone-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="What should I focus on this week? / How do I bridge my learning gaps...?"
                  value={customInquiry}
                  onChange={(e) => setCustomInquiry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customInquiry.trim()) {
                      fetchDecisionSupport(customInquiry.trim());
                      setCustomInquiry("");
                    }
                  }}
                  className="w-full bg-[#fbfbfa] border border-[#e5e5e0] focus:border-black focus:ring-1 focus:ring-black outline-none rounded-xl py-3 pl-9 pr-4 text-xs font-sans text-stone-800 transition-all placeholder:text-stone-400"
                />
              </div>

              <button
                onClick={() => {
                  if (customInquiry.trim()) {
                    fetchDecisionSupport(customInquiry.trim());
                    setCustomInquiry("");
                  } else {
                    fetchDecisionSupport("What should I focus on this week?");
                  }
                }}
                disabled={loadingDecision}
                className="w-full sm:w-auto px-5 py-3 bg-stone-900 text-white font-bold hover:bg-black rounded-xl text-xs uppercase tracking-wider shrink-0 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {loadingDecision ? "Computing..." : "Query Cortex"}
              </button>
            </div>

            {/* Quick pre-set prompts */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-stone-500">
              <span className="mr-1">Queries:</span>
              <button 
                onClick={() => fetchDecisionSupport("What should I focus on this week?")}
                className="px-2 py-0.5 border border-[#e5e5e0] rounded-md hover:border-black hover:text-black hover:bg-stone-50 transition-all cursor-pointer"
              >
                Weekly Focus
              </button>
              <button 
                onClick={() => fetchDecisionSupport("What is my biggest current learning gap?")}
                className="px-2 py-0.5 border border-[#e5e5e0] rounded-md hover:border-black hover:text-black hover:bg-stone-50 transition-all cursor-pointer"
              >
                My Learning Gap
              </button>
              <button 
                onClick={() => fetchDecisionSupport("Recommend a startup MVP concept using my saved items")}
                className="px-2 py-0.5 border border-[#e5e5e0] rounded-md hover:border-black hover:text-black hover:bg-stone-50 transition-all cursor-pointer"
              >
                Startup Blueprint
              </button>
            </div>
          </div>

          {loadingDecision ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <RefreshCw className="animate-spin text-stone-800" size={20} />
              <span className="text-[10px] font-bold tracking-widest uppercase font-mono text-[#8c8c88]">Synthesizing decision graph matrices...</span>
            </div>
          ) : decision ? (
            <div className="space-y-6" id="decision-partner-results-panel">
              
              {/* Query Response Header */}
              <div className="border border-[#e5e5e0] bg-[#fafaf9] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider font-mono">Cortex Result Matrix</span>
                  <span className="px-2 py-0.5 bg-black text-white text-[8px] font-bold uppercase tracking-widest font-mono rounded">
                    Active Query: {activeQueryText}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-semibold text-[#8c8c88] tracking-wider block font-mono">Consolidated Observation</span>
                  <p className="text-xs text-[#1a1a1a] leading-relaxed font-sans">{decision.activeContextText}</p>
                </div>

                <div className="border-t border-[#e5e5e0] pt-3">
                  <span className="text-[9px] uppercase font-semibold text-[#8c8c88] tracking-wider block font-mono mb-1">Cortex Highlight Goal</span>
                  <p className="text-xs font-bold text-black flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-stone-700 font-bold shrink-0" />
                    <span>{decision.weeklyGoal}</span>
                  </p>
                </div>
              </div>

              {/* Priority Ranking Streams */}
              <div className="space-y-4" id="cortex-priority-ranking-stack">
                <span className="text-[10px] text-[#8c8c88] uppercase font-bold tracking-wider font-mono block">Prioritized Strategic Actions</span>
                
                {decision.priorityRanking.map((item, index) => (
                  <div key={index} className="border border-[#e5e5e0] rounded-xl p-5 hover:border-black transition-all bg-white flex flex-col md:flex-row items-start gap-4">
                    
                    {/* Position Label Column */}
                    <div className="flex items-center gap-2 shrink-0 md:w-32">
                      <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-xs font-mono font-bold text-black border border-stone-200">
                        {index + 1}
                      </div>
                      <span className={`text-[9px] uppercase font-bold border font-mono px-2 py-0.5 rounded-full ${
                        item.importance === "High" 
                          ? "bg-red-50 border-red-100 text-red-600" 
                          : item.importance === "Medium"
                            ? "bg-amber-50 border-amber-100 text-amber-700"
                            : "bg-stone-100 border-stone-200 text-stone-600"
                      }`}>
                        {item.importance}
                      </span>
                    </div>

                    {/* Reasoning Column */}
                    <div className="flex-1 space-y-3">
                      <div className="space-y-1">
                        <span className="text-stone-400 font-mono text-[9px] uppercase">#{item.type} Vector Action</span>
                        <h4 className="text-xs font-bold text-[#1a1a1a] block leading-tight">{item.title}</h4>
                        <p className="text-xs text-[#73736e] leading-relaxed mt-1">{item.reasoning}</p>
                      </div>

                      {/* Suggested Steps sublist */}
                      {item.suggestedActions && item.suggestedActions.length > 0 && (
                        <div className="space-y-1.5 bg-[#fbfbfa] border border-[#f0f0ed] p-3 rounded-lg">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-[#8c8c88] font-mono block">Suggested Execution Roadmap:</span>
                          <ul className="space-y-1 text-xs list-none">
                            {item.suggestedActions.map((act, aIdx) => (
                              <li key={aIdx} className="flex items-start gap-1.5 text-[11px] text-stone-700 leading-snug">
                                <ChevronRight size={11} className="text-stone-500 shrink-0 mt-0.5" />
                                <span>{act}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>

            </div>
          ) : (
            <div className="text-center py-12 text-[#8c8c88] text-xs font-mono border border-dashed border-[#e5e5e0] rounded-xl">
              An error occurred formulating target decision recomendation maps.
            </div>
          )}

        </div>
      )}

    </div>
  );
}
