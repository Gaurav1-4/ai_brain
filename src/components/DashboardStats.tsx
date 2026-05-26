/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { RawSource, KnowledgeObject, Project } from "../types";
import { 
  Inbox, 
  Layers, 
  Cpu, 
  Sparkles, 
  CheckCircle2, 
  FolderGit2, 
  TrendingUp, 
  Clock, 
  Wand2,
  Calendar
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface StatsProps {
  rawSources: RawSource[];
  knowledgeObjects: KnowledgeObject[];
  projects: Project[];
  hasApiKey: boolean;
}

export function DashboardStats({ rawSources, knowledgeObjects, projects, hasApiKey }: StatsProps) {
  const [queueMetrics, setQueueMetrics] = useState({
    queuedCount: 0,
    processingCount: 0,
    processedCount: 0,
    failedCount: 0,
    totalCount: 0,
    budgetCallsToday: 0,
    budgetCallsMax: 20,
    budgetCallsRemaining: 20,
    isQuotaExceeded: false,
    clustersCount: 0
  });

  const fetchLiveMetrics = async () => {
    try {
      const res = await fetch("/api/queue");
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) {
          setQueueMetrics({
            ...data.metrics,
            clustersCount: data.clusters?.length || 0
          });
        }
      }
    } catch (e) {
      console.error("DashboardStats queue fetch error:", e);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
    const interval = setInterval(fetchLiveMetrics, 7000);
    return () => clearInterval(interval);
  }, []);

  // Compute emerging topics counts
  const topicCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};
  const projectLinkCounts: Record<string, number> = {};

  knowledgeObjects.forEach((k) => {
    k.topics.forEach((top) => {
      topicCounts[top] = (topicCounts[top] || 0) + 1;
    });
    k.tools.forEach((tl) => {
      toolCounts[tl] = (toolCounts[tl] || 0) + 1;
    });
    k.projects.forEach((proj) => {
      projectLinkCounts[proj] = (projectLinkCounts[proj] || 0) + 1;
    });
  });

  // Top Emerging Topics array sorted
  const topTopics = Object.entries(topicCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Strongest Projects array sorted
  const topProjects = projects
    .map((p) => ({
      name: p.name,
      description: p.description,
      count: projectLinkCounts[p.name] || 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // Recently Processed Knowledge nodes
  const recentlyProcessed = [...knowledgeObjects]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  // Data for Charts
  const chartData = topTopics.map(t => ({ name: t.name, count: t.count }));

  return (
    <div className="space-y-6" id="dashboard-stats-viewport">
      {/* Redesigned Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" id="stat-cards-grid">
        
        {/* Metric 1: Inbox Count */}
        <div className="bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all" id="stat-card-inbox-capacity">
          <div className="p-2.5 bg-[#f5f5f4] text-[#1a1a1a] rounded-lg shrink-0">
            <Inbox size={18} />
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[#8c8c88] block tracking-wider uppercase">Inbox Count</span>
            <span className="text-3xl font-semibold text-[#1a1a1a] mt-1 block font-sans tracking-tight">
              {queueMetrics.totalCount}
            </span>
            <span className="text-[11px] text-[#73736e] mt-1 block leading-tight font-sans">
              Captured assets index
            </span>
          </div>
        </div>

        {/* Metric 2: Queued Resources */}
        <div className="bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all" id="stat-card-queued-resources">
          <div className="p-2.5 bg-[#f0f9ff] text-[#0369a1] rounded-lg shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[#8c8c88] block tracking-wider uppercase">Queued Resources</span>
            <span className="text-3xl font-semibold text-[#0369a1] mt-1 block font-sans tracking-tight">
              {queueMetrics.queuedCount}
            </span>
            <span className="text-[11px] text-[#0369a1] mt-1 block leading-tight font-sans">
              Pending batch compile
            </span>
          </div>
        </div>

        {/* Metric 3: Today's Processing Budget */}
        <div className="bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all" id="stat-card-processing-budget">
          <div className="p-2.5 bg-[#f0fdf4] text-[#15803d] rounded-lg shrink-0">
            <Cpu size={18} />
          </div>
          <div className="w-full">
            <span className="text-[10px] font-semibold text-[#8c8c88] block tracking-wider uppercase">Today's AI Budget</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-[#15803d] text-emerald-800 tracking-tight">
                {queueMetrics.budgetCallsRemaining}
              </span>
              <span className="text-stone-400 text-xs shrink-0 font-mono">/ {queueMetrics.budgetCallsMax} left</span>
            </div>
            <span className="text-[11px] text-[#73736e] mt-1.5 block leading-tight font-mono">
              Quota limit resets in 24h
            </span>
          </div>
        </div>

        {/* Metric 4: Knowledge Clusters */}
        <div className="bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-start gap-4 transition-all" id="stat-card-knowledge-clusters-total">
          <div className="p-2.5 bg-[#faf5ff] text-[#6b21a8] rounded-lg shrink-0">
            <Layers size={18} />
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[#8c8c88] block tracking-wider uppercase">Knowledge Clusters</span>
            <span className="text-3xl font-semibold text-[#6b21a8] mt-1 block font-sans tracking-tight">
              {queueMetrics.clustersCount}
            </span>
            <span className="text-[11px] text-[#73736e] mt-1 block leading-tight font-sans">
              Smart grouped research lines
            </span>
          </div>
        </div>

      </div>

      {/* Primary Analytics Deck Layout Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-analytics-deck">
        
        {/* Chart representation for Emerging topics */}
        <div className="lg:col-span-4 bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-xs" id="chart-emerging-topics">
          <h3 className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider mb-4 flex items-center gap-1.5 font-mono">
            <TrendingUp size={14} className="text-[#1a1a1a]" />
            <span>Top Emerging Topics</span>
          </h3>
          {chartData.length > 0 ? (
            <div className="space-y-3.5">
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="#1a1a1a" fontSize={11} fontWeight={500} tickLine={false} axisLine={false} width={85} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#1a1a1a", border: "none", color: "#fff", borderRadius: "6px", fontSize: "11px" }}
                    />
                    <Bar dataKey="count" fill="#1a1a1a" radius={[0, 4, 4, 0]} barSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="border-t border-[#f0f0ed] pt-3 text-[10px] text-stone-400 font-mono">
                Concentration of cataloged intellectual segments
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-[10px] text-[#8c8c88] font-mono italic text-center">
              Awaiting batch queue compilation to construct emerging vectors
            </div>
          )}
        </div>

        {/* Strongest Workspaces and Projects Directory */}
        <div className="lg:col-span-4 bg-white border border-[#e5e5e0] rounded-xl p-5 shadow-xs" id="strongest-projects-feed">
          <h3 className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider mb-4 flex items-center gap-1.5 font-mono">
            <FolderGit2 size={14} className="text-stone-600" />
            <span>Strongest Projects ({projects.length})</span>
          </h3>
          {topProjects.length > 0 ? (
            <div className="space-y-3.5">
              <div className="space-y-2.5">
                {topProjects.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs bg-[#fafaf9] border border-[#f0f0ed] rounded-lg p-2">
                    <div className="max-w-[75%]">
                      <span className="font-semibold text-[#1a1a1a] block truncate">{p.name}</span>
                      <span className="text-[10px] text-stone-500 block truncate">{p.description || "Core research bucket"}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#1a1a1a] text-white px-2 py-0.5 rounded leading-none shrink-0" title={`${p.count} connected nodes`}>
                      {p.count} cards
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#f0f0ed] pt-2 text-[10px] text-stone-400 font-mono leading-tight">
                Projects with the highest linked semantic weights
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-[10px] text-[#8c8c88] font-mono italic text-center">
              No active projects. Create some above to connect notes.
            </div>
          )}
        </div>

        {/* Recently Compiled and processed nodes overview */}
        <div className="lg:col-span-4 bg-[#fafaf9] border border-[#e5e5e0] rounded-xl p-5 flex flex-col justify-between" id="recently-processed-timeline">
          <div>
            <h3 className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider mb-3.5 flex items-center gap-1.5 font-mono">
              <CheckCircle2 size={13} className="text-emerald-700" />
              <span>Recently Compiled</span>
            </h3>

            {recentlyProcessed.length > 0 ? (
              <div className="space-y-3">
                {recentlyProcessed.map((k) => (
                  <div key={k.knowledgeId} className="border-l-2 border-emerald-500 pl-3 space-y-0.5">
                    <span className="text-[11px] font-semibold text-neutral-800 block truncate" title={k.summary}>
                      {k.summary}
                    </span>
                    <span className="text-[9px] text-[#8c8c88] block font-mono">
                      Compiled: {new Date(k.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {k.tools.slice(0, 2).map(t => (
                        <span key={t} className="text-[8px] bg-white border border-[#e5e5e0] text-[#1a1a1a] px-1 py-0.2 rounded font-mono font-bold">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-[10px] text-[#8c8c88] font-mono italic text-center">
                Awaiting first batch compile run to index structured cards
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#e5e5e0] border-dashed text-[10px] text-[#8c8c88] font-mono flex items-center justify-between">
            <span>Memory Nodes: {knowledgeObjects.length}</span>
            <span className="text-emerald-700 font-bold">100% Consolidated</span>
          </div>
        </div>

      </div>
    </div>
  );
}
