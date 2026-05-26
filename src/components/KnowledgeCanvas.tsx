/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { KnowledgeObject, SearchResult, SourceType } from "../types";
import { Search, Hash, Calendar, Layers, CheckCircle2, Trash2, CalendarClock, ChevronDown, ChevronUp, Link, Compass, Info, HelpCircle } from "lucide-react";

interface CanvasProps {
  knowledgeObjects: KnowledgeObject[];
  onDeleteSuccess: () => void;
}

export function KnowledgeCanvas({ knowledgeObjects, onDeleteSuccess }: CanvasProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedActionability, setSelectedActionability] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRawId, setShowRawId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "network">("list");
  const [activeNetworkNode, setActiveNetworkNode] = useState<string | null>(null);

  // Trigger search on query change or when total knowledge updates
  useEffect(() => {
    const executeSearch = async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery })
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setSearching(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      executeSearch();
    }, 280);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, knowledgeObjects]);

  // Extract all unique filters
  const allTopics = Array.from(new Set(knowledgeObjects.flatMap(k => k.topics)));
  const allTools = Array.from(new Set(knowledgeObjects.flatMap(k => k.tools)));

  const handleTopicToggle = (topic: string) => {
    setSelectedTopics(p => p.includes(topic) ? p.filter(t => t !== topic) : [...p, topic]);
  };

  const handleToolToggle = (tool: string) => {
    setSelectedTools(p => p.includes(tool) ? p.filter(t => t !== tool) : [...p, tool]);
  };

  const handleDelete = async (knowledgeId: string) => {
    if (!confirm("Are you sure you want to delete this knowledge from AI Brain memory? Original raw ingestion file will also be removed.")) return;
    try {
      const res = await fetch(`/api/knowledge/${knowledgeId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleteSuccess();
        if (expandedId === knowledgeId) setExpandedId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Client-side filtering in addition to backend search results
  const filteredResults = searchResults.filter(item => {
    if (selectedTopics.length > 0 && !item.knowledge.topics.some(t => selectedTopics.includes(t))) {
      return false;
    }
    if (selectedTools.length > 0 && !item.knowledge.tools.some(t => selectedTools.includes(t))) {
      return false;
    }
    return true;
  });

  // Calculate coordinates for simple mock SVGs network simulation
  const graphNodes = knowledgeObjects.map((k, i) => {
    const angle = (i / knowledgeObjects.length) * 2 * Math.PI;
    const radius = 120;
    return {
      id: k.knowledgeId,
      name: k.summary.length > 25 ? k.summary.substring(0, 25) + "..." : k.summary,
      topic: k.topics[0] || "General",
      tools: k.tools,
      x: 180 + radius * Math.cos(angle),
      y: 180 + radius * Math.sin(angle),
    };
  });

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] w-full mb-8" id="knowledge-canvas-card">
      {/* Header controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#e5e5e0] pb-5 mb-5" id="canvas-header-div">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2">
            <Compass className="text-[#1a1a1a]" size={16} />
            <span>Search & Connections Canvas</span>
          </h2>
          <p className="text-xs text-[#73736e]">Query your brain via natural language prompts, filter tag nodes, or inspect semantic clusters.</p>
        </div>

        {/* View togglers */}
        <div className="flex items-center bg-[#f0f0ed] p-1 rounded-lg self-start md:self-auto text-xs" id="view-mode-tabs">
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1 rounded-md font-bold uppercase tracking-wider text-[10px] transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-[#1a1a1a] shadow-xs" : "text-[#73736e] hover:text-[#1a1a1a]"}`}
          >
            Directory View
          </button>
          <button
            onClick={() => setViewMode("network")}
            className={`px-3 py-1 rounded-md font-bold uppercase tracking-wider text-[10px] transition-all cursor-pointer ${viewMode === "network" ? "bg-white text-[#1a1a1a] shadow-xs" : "text-[#73736e] hover:text-[#1a1a1a]"}`}
          >
            Connection Graph
          </button>
        </div>
      </div>

      {/* Primary search bar */}
      <div className="relative mb-5" id="canvas-search-box">
        <span className="absolute left-3.5 top-3 z-10 text-[#8c8c88]">
          <Search size={16} className={searching ? "animate-pulse text-black" : ""} />
        </span>
        <input
          type="text"
          placeholder="Ask your Brain: 'Have I ever seen dashboard designs?' or 'Bolt.new cheatsheets'..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded-xl pl-10 pr-4 py-2.5 text-xs focus:ring-1 focus:ring-black focus:bg-white outline-none transition-all placeholder:text-[#8c8c88] font-sans shadow-xs"
          id="nlp-query-input"
        />
      </div>

      {/* Dynamic Tag Filters */}
      <div className="mb-6 space-y-4" id="tag-filters-container">
        {/* Topic chips */}
        {allTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" id="topic-chips-group">
            <span className="text-[10px] uppercase font-bold text-[#8c8c88] tracking-widest mr-1.5">Topics</span>
            {allTopics.map((topic) => {
              const active = selectedTopics.includes(topic);
              return (
                <button
                  key={topic}
                  onClick={() => handleTopicToggle(topic)}
                  className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider font-sans transition-all border cursor-pointer ${
                    active 
                      ? "bg-[#1a1a1a] text-white border-black shadow-xs" 
                      : "bg-[#f0f0ed] text-[#73736e] border-[#e5e5e0] hover:bg-stone-200"
                  }`}
                >
                  #{topic}
                </button>
              );
            })}
          </div>
        )}

        {/* Tool chips */}
        {allTools.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" id="tool-chips-group">
            <span className="text-[10px] uppercase font-bold text-[#8c8c88] tracking-widest mr-1.5">Tools</span>
            {allTools.map((tool) => {
              const active = selectedTools.includes(tool);
              return (
                <button
                  key={tool}
                  onClick={() => handleToolToggle(tool)}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-mono transition-all border cursor-pointer ${
                    active 
                      ? "bg-black text-white border-black shadow-xs" 
                      : "bg-[#f0f0ed] text-[#73736e] border-[#e5e5e0] hover:bg-[#e1e1de]"
                  }`}
                >
                  {tool}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Directory List View */}
      {viewMode === "list" && (
        <div className="space-y-4" id="knowledge-list-view">
          {filteredResults.map(({ knowledge, score, matchType }) => {
            const isExpanded = expandedId === knowledge.knowledgeId;
            const scorePercent = Math.round(score * 100);

            // Dynamic badges styling
            let badgeStyle = "bg-[#f0f0ed] text-[#73736e] border-[#e5e5e0]";
            if (knowledge.actionabilityScore === "Immediate Use") badgeStyle = "bg-[#1a1a1a] text-[#ffffff] border-black font-bold uppercase tracking-wider text-[8px]";
            else if (knowledge.actionabilityScore === "Useful Soon") badgeStyle = "bg-[#f0f0ed] text-[#1a1a1a] border-[#e5e5e0] uppercase tracking-wider text-[8px]";

            return (
              <div
                key={knowledge.knowledgeId}
                className={`bg-white border rounded-xl transition-all shadow-xs ${
                  isExpanded ? "border-black ring-1 ring-black" : "border-[#e5e5e0] hover:border-black"
                }`}
                id={`knowledge-card-${knowledge.knowledgeId}`}
              >
                {/* Visual Header */}
                <div
                  className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none"
                  onClick={() => {
                    const nextId = isExpanded ? null : knowledge.knowledgeId;
                    setExpandedId(nextId);
                    if (nextId) {
                      fetch("/api/memory/event", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          knowledgeId: knowledge.knowledgeId,
                          eventType: "viewed",
                          context: "Inspect detailed structured summaries in directory view."
                        })
                      }).catch(err => console.error(err));
                    }
                  }}
                >
                  <div className="flex-1 space-y-2">
                    {/* Upper row: Source name and score indicators */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#f0f0ed] text-[#1a1a1a] text-[9px] rounded font-bold font-mono uppercase tracking-wider">
                        {knowledge.source}
                      </span>
                      
                      {searchQuery && (
                        <span className={`px-2 py-0.5 text-[9px] rounded font-mono ${
                          matchType === "semantic" ? "bg-[#1a1a1a] text-white" : "bg-[#f0f0ed] text-[#1a1a1a]"
                        }`}>
                          {matchType === "semantic" ? `🧠 ${scorePercent}% match` : "Keyword link"}
                        </span>
                      )}

                      <span className={`px-2 py-0.5 text-[9px] rounded font-medium border ${badgeStyle}`}>
                        {knowledge.actionabilityScore}
                      </span>
                    </div>

                    {/* Summary sentence */}
                    <h3 className="text-sm font-semibold text-[#1a1a1a] leading-snug tracking-tight font-sans">
                      {knowledge.summary}
                    </h3>

                    {/* Embedded categorizations pill view */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {knowledge.topics.map(t => (
                        <span key={t} className="text-[10px] text-[#73736e] font-mono">#{t}</span>
                      ))}
                      {knowledge.tools.map(tool => (
                        <span key={tool} className="text-[10px] px-1 bg-black text-white rounded font-mono font-bold leading-relaxed">{tool}</span>
                      ))}
                    </div>
                  </div>

                  <div className="text-[#8c8c88] p-1 flex items-center shrink-0">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Extended content details panel */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-[#e5e5e0] pt-4 space-y-4 text-xs text-[#1a1a1a] bg-[#fafaf9] rounded-b-xl">
                    {/* Actionable summary details */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Detailed Insight Summary</span>
                      <p className="leading-relaxed bg-white border border-[#e5e5e0] rounded-lg p-3 text-[#1a1a1a] shadow-xs">
                        {knowledge.detailedSummary}
                      </p>
                    </div>

                    {/* GitHub Repository Fingerprint Section */}
                    {knowledge.source === "github" && knowledge.repoMetadata && (
                      <div className="bg-[#1e1e1d] border border-black text-[#efefef] rounded-xl p-4 space-y-3 font-mono shadow-md">
                        <div className="flex items-center justify-between border-b border-[#333] pb-2">
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            🐙 GitHub repository fingerprint
                          </span>
                          <span className="text-[10px] text-stone-400 font-mono">
                            ⭐ {knowledge.repoMetadata.stars || 120} stars
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Language</span>
                            <span className="text-white font-bold">{knowledge.repoMetadata.fingerprint?.language || knowledge.repoMetadata.primaryLanguage || "Markdown"}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Framework</span>
                            <span className="text-white font-bold">{knowledge.repoMetadata.fingerprint?.framework || (knowledge.repoMetadata.frameworks && knowledge.repoMetadata.frameworks[0]) || "Plain code"}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Database Setup</span>
                            <span className="text-amber-300">{knowledge.repoMetadata.fingerprint?.database || "None"}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Deployment</span>
                            <span className="text-stone-300">{(knowledge.repoMetadata.fingerprint?.deployment || []).join(", ") || "Self-Hosted"}</span>
                          </div>
                        </div>
                        {knowledge.repoMetadata.fingerprint?.ai_stack && knowledge.repoMetadata.fingerprint.ai_stack.length > 0 && (
                          <div className="pt-2 border-t border-[#333]">
                            <span className="text-stone-400 block text-[9px] uppercase mb-1">AI Stack Technologies</span>
                            <div className="flex flex-wrap gap-1.5 font-mono">
                              {knowledge.repoMetadata.fingerprint.ai_stack.map(tech => (
                                <span key={tech} className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 text-[10px] rounded border border-amber-500/20">
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="text-[9px] text-stone-500 italic pt-1 text-right">
                          Cloned safely locally to <code className="text-white font-mono">{knowledge.repoMetadata.localPath}</code>
                        </div>
                      </div>
                    )}

                    {/* Metadata grids block */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Projects & Scenarios */}
                      <div className="bg-white border border-[#e5e5e0] rounded-lg p-3 space-y-2">
                        <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Contextual Workspace Map</span>
                        <div>
                          <span className="text-[#8c8c88] block text-[10px]">Linked ongoing Projects:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {knowledge.projects.map(p => (
                              <span key={p} className="px-2 py-0.5 bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded text-[10px] font-bold font-mono uppercase tracking-wider">
                                {p}
                              </span>
                            ))}
                            {knowledge.projects.length === 0 && (
                              <span className="text-[10px] text-[#8c8c88] italic font-mono">Unlinked general memory</span>
                            )}
                          </div>
                        </div>

                        <div className="pt-1.5">
                          <span className="text-[#8c8c88] block text-[10px]">Sub-concepts identified:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {knowledge.concepts.map(c => (
                              <span key={c} className="px-1.5 py-0.5 bg-[#f0f0ed] text-[#73736e] rounded text-[10px] font-mono">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Use cases Checklist */}
                      <div className="bg-white border border-[#e5e5e0] rounded-lg p-3 space-y-2">
                        <span className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider block">Future Use Cases</span>
                        <div className="space-y-1.5 max-h-[105px] overflow-y-auto">
                          {knowledge.futureUseCases.map((useCase, index) => (
                            <div key={index} className="flex items-start gap-1.5 font-sans">
                              <CheckCircle2 size={13} className="text-[#1a1a1a] shrink-0 mt-0.5" />
                              <span className="text-[#73736e] leading-snug text-[11px] font-sans">{useCase}</span>
                            </div>
                          ))}
                          {knowledge.futureUseCases.length === 0 && (
                            <span className="text-[10px] text-[#8c8c88] italic font-mono">None logged</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Absolute core: Raw preserve values for auditing */}
                    <div className="border border-[#e5e5e0] rounded-lg bg-white overflow-hidden">
                      <button
                        onClick={() => setShowRawId(showRawId === knowledge.knowledgeId ? null : knowledge.knowledgeId)}
                        className="w-full flex items-center justify-between text-[#73736e] px-3 py-2 bg-[#f0f0ed] hover:bg-stone-200 select-none text-[10px] font-bold uppercase tracking-wider"
                      >
                        <span className="flex items-center gap-1.5">
                          <Layers size={11} />
                          <span>Audit raw ingestion coordinates</span>
                        </span>
                        {showRawId === knowledge.knowledgeId ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>

                      {showRawId === knowledge.knowledgeId && (
                        <div className="p-3 bg-stone-900 text-[#f0f0ed] font-mono text-[10px] border-t border-[#e5e5e0] max-h-[110px] overflow-y-auto">
                          <div><span className="text-[#8c8c88]">"raw_id":</span> "{knowledge.rawSourceId}"</div>
                          {knowledge.url && <div><span className="text-[#8c8c88]">"url":</span> <a href={knowledge.url} target="_blank" rel="noreferrer" className="text-stone-300 underline font-mono tracking-tight">{knowledge.url}</a></div>}
                          {knowledge.userNote && <div><span className="text-[#8c8c88]">"user_note":</span> "{knowledge.userNote}"</div>}
                          <div><span className="text-[#8c8c88]">"timestamp":</span> "{knowledge.createdAt}"</div>
                        </div>
                      )}
                    </div>

                    {/* Delete actions row */}
                    <div className="flex justify-between items-center text-[10px] text-[#8c8c88]">
                      <span className="flex items-center gap-1 font-mono">
                        <CalendarClock size={12} />
                        <span>Captured {new Date(knowledge.createdAt).toLocaleDateString()}</span>
                      </span>

                      <button
                        onClick={() => handleDelete(knowledge.knowledgeId)}
                        className="text-red-600 hover:text-red-700 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={11} />
                        <span>Wipe node</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredResults.length === 0 && (
            <div className="border border-dashed border-[#e5e5e0] rounded-xl p-8 text-center text-xs text-[#8c8c88] font-mono">
              <Info className="mx-auto mb-2 text-[#8c8c88]" size={20} />
              No memory links identified for search filter configurations. Ingest links above or adjust filters.
            </div>
          )}
        </div>
      )}

      {/* Network clusters graph visualization */}
      {viewMode === "network" && (
        <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-xl p-4 flex flex-col md:flex-row gap-5" id="knowledge-network-view">
          {/* Main SVG Container */}
          <div className="flex-1 bg-white border border-[#e5e5e0] rounded-lg p-2 flex justify-center items-center shadow-inner relative overflow-hidden min-h-[360px]" id="svg-stage">
            {graphNodes.length > 0 ? (
              <svg width="360" height="360" viewBox="0 0 360 360" className="max-w-full">
                {/* Visual links lines */}
                {graphNodes.map((target) => (
                  <line
                    key={`line-${target.id}`}
                    x1="180"
                    y1="180"
                    x2={target.x}
                    y2={target.y}
                    stroke="#e5e5e0"
                    strokeWidth="1.5"
                    strokeDasharray={target.tools.includes("Figma") ? "0" : "3,3"}
                  />
                ))}

                {/* Central brain hub node */}
                <circle
                  cx="180"
                  cy="180"
                  r="26"
                  fill="#1a1a1a"
                  className="animate-pulse shadow-xs cursor-pointer transition-all"
                  onClick={() => setActiveNetworkNode("hub")}
                />
                <text x="180" y="183" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle" className="pointer-events-none select-none font-sans uppercase">
                  Brain
                </text>

                {/* Circle surrounding nodes */}
                {graphNodes.map((node) => {
                  const isActive = activeNetworkNode === node.id;
                  return (
                    <g key={node.id} className="cursor-pointer" onClick={() => setActiveNetworkNode(node.id)}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isActive ? "11" : "8"}
                        fill={isActive ? "#1a1a1a" : "#8c8c88"}
                        stroke={isActive ? "#000" : "#fff"}
                        strokeWidth={isActive ? "3.5" : "1.5"}
                        className="transition-all duration-300 hover:scale-125 hover:fill-black"
                        title={node.name}
                      />
                      <text
                        x={node.x}
                        y={node.y < 180 ? node.y - 14 : node.y + 19}
                        fill="#1a1a1a"
                        fontSize="8"
                        fontWeight={isActive ? "bold" : "normal"}
                        textAnchor="middle"
                        className="pointer-events-none select-none font-sans tracking-tight"
                      >
                        {node.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              <div className="text-center text-[#8c8c88] font-mono text-xs">Awaiting memory links initialization...</div>
            )}
            
            <div className="absolute top-2 left-2 bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider select-none pointer-events-none font-mono">
              Vector Map Rendering
            </div>
          </div>

          {/* Node inspect pane detailing */}
          <div className="w-full md:w-64 border border-[#e5e5e0] bg-white rounded-lg p-4 flex flex-col justify-between" id="network-node-inspector">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8c8c88] mb-3 flex items-center gap-1.5">
                <Info size={11} />
                <span>Cluster Inspection</span>
              </h4>

              {activeNetworkNode && activeNetworkNode !== "hub" ? (() => {
                const nodeInfo = knowledgeObjects.find(k => k.knowledgeId === activeNetworkNode);
                if (!nodeInfo) return <p className="text-xs text-[#8c8c88] italic font-mono">Node not found</p>;
                return (
                  <div className="space-y-3 font-sans animate-fade-in" id="canvas-network-meta-detail">
                    <div>
                      <span className="text-[10px] text-[#8c8c88] uppercase tracking-wider font-bold block">Headline:</span>
                      <p className="text-xs font-semibold text-[#1a1a1a] leading-tight mt-0.5">{nodeInfo.summary}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8c8c88] uppercase tracking-wider font-bold block">Topic:</span>
                      <span className="px-1.5 py-0.5 bg-[#f0f0ed] text-[#1a1a1a] rounded text-[9px] font-mono mt-1 inline-block">#{nodeInfo.topics[0]}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8c8c88] uppercase tracking-wider font-bold block">Sub-concepts:</span>
                      <p className="text-xs text-[#73736e] font-mono mt-0.5 leading-snug">{nodeInfo.concepts.join(", ") || "None"}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#8c8c88] uppercase tracking-wider font-bold block">Preserved Tools:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {nodeInfo.tools.map(tool => (
                          <span key={tool} className="px-1 bg-black text-white text-[9px] rounded font-mono">{tool}</span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setExpandedId(nodeInfo.knowledgeId);
                        setViewMode("list");
                      }}
                      className="w-full text-center mt-3 bg-black text-white rounded-lg py-1.5 hover:bg-stone-850 transition-all font-bold uppercase tracking-wider text-[9px] cursor-pointer"
                    >
                      Inspect Detail Log
                    </button>
                  </div>
                );
              })() : (
                <div className="text-[#8c8c88] text-xs py-10 text-center italic font-mono leading-relaxed">
                  {activeNetworkNode === "hub" 
                    ? "🧠 Central hub representing total cognitive memory database values. Click target nodes." 
                    : "Tap nodes on the vector connection graph to inspect structured values."}
                </div>
              )}
            </div>

            <div className="text-[9px] text-[#73736e] bg-[#f0f0ed] p-2 mt-4 rounded-lg font-mono leading-snug">
              💡 Solid strokes indicate reference matches. Dashed vectors represent mathematical semantic alignments.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

