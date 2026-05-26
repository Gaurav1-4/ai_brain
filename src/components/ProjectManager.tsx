/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Project, KnowledgeObject } from "../types";
import { FolderGit2, Sparkles, Plus, Trash2, FolderClosed, Calendar, FolderOpen, Layers, CheckCircle } from "lucide-react";

interface ProjectsProps {
  projects: Project[];
  knowledgeObjects: KnowledgeObject[];
  onProjectSuccess: () => void;
}

export function ProjectManager({ projects, knowledgeObjects, onProjectSuccess }: ProjectsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() })
      });
      if (res.ok) {
        setName("");
        setDescription("");
        setShowCreate(false);
        onProjectSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to remove this project space? Knowledge objects will be preserved and unlinked from this space.")) return;
    try {
      const res = await fetch(`/api/project/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (activeProject === id) setActiveProject(null);
        onProjectSuccess();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] mb-8" id="projects-manager-card">
      <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-4 mb-5" id="projects-header-div">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2">
            <FolderGit2 className="text-[#1a1a1a]" size={16} />
            <span>Structured Project Spaces</span>
          </h2>
          <p className="text-xs text-[#73736e]">Map target workspaces. The systems autolink discovered social clips to these hubs.</p>
        </div>

        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-black text-white font-bold uppercase tracking-wider text-[10px] rounded-lg cursor-pointer select-none transition-all duration-150 flex items-center gap-1 active:scale-[0.98]"
        >
          <Plus size={12} />
          <span>New Space</span>
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateProject} className="bg-[#fafaf9] border border-[#e5e5e0] border-dashed rounded-lg p-4 mb-5 space-y-3" id="create-project-form">
          <h4 className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-wider">Initialize workspace map</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-[#8c8c88] tracking-wider uppercase block mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Gozora App, AI Brain MVP"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-[#e5e5e0] rounded-lg p-2 text-xs focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-[#8c8c88] font-medium text-[#1a1a1a]"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-[#8c8c88] tracking-wider uppercase block mb-1">Scope / Description</label>
              <input
                type="text"
                placeholder="e.g. SaaS visuals, database metrics"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-[#e5e5e0] rounded-lg p-2 text-xs focus:ring-1 focus:ring-black outline-none transition-all placeholder:text-[#8c8c88] text-[#1a1a1a]"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1 text-xs text-[#73736e] hover:text-[#1a1a1a] font-medium"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded text-[10px] font-bold uppercase tracking-wider hover:bg-black cursor-pointer"
              disabled={loading}
            >
              Confirm Setup
            </button>
          </div>
        </form>
      )}

      {/* Grid of existing spaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="projects-grid-list">
        {projects.map((proj) => {
          // Count mapped objects where project.name matches list
          const mappedObjects = knowledgeObjects.filter((k) => k.projects.includes(proj.name));
          const isActive = activeProject === proj.id;

          return (
            <div
              key={proj.id}
              onClick={() => setActiveProject(isActive ? null : proj.id)}
              className={`border rounded-xl p-4 cursor-pointer select-none transition-all duration-150 shadow-[0_2px_4px_rgba(0,0,0,0.02)] ${
                isActive 
                  ? "border-[#1a1a1a] bg-[#fafaf9] ring-1 ring-black" 
                  : "border-[#e5e5e0] bg-white hover:border-[#1a1a1a]"
              }`}
              id={`project-node-card-${proj.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`${isActive ? "text-[#1a1a1a]" : "text-[#8c8c88]"}`}>
                  {isActive ? <FolderOpen size={16} /> : <FolderClosed size={16} />}
                </div>
                <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-[#f0f0ed] text-[#1a1a1a] rounded">
                  {mappedObjects.length} Nodes
                </span>
              </div>

              <h4 className="text-xs font-bold text-[#1a1a1a] tracking-tight">{proj.name}</h4>
              <p className="text-[10px] text-[#73736e] mt-1 leading-normal line-clamp-2 h-7">{proj.description || "Active context mappings"}</p>

              <div className="mt-3 pt-2.5 border-t border-[#e5e5e0] flex items-center justify-between text-[9px] text-[#8c8c88] font-mono leading-none">
                <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(proj.id);
                  }}
                  className="text-[#8c8c88] hover:text-[#1a1a1a] transition-all select-none cursor-pointer p-0.5"
                  title="Wipe space mapping"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grouped Folder list content items detail panel */}
      {activeProject && (() => {
        const proj = projects.find(p => p.id === activeProject);
        if (!proj) return null;
        const linkedItems = knowledgeObjects.filter(k => k.projects.includes(proj.name));

        return (
          <div className="bg-[#fafaf9] border border-[#e5e5e0] rounded-xl p-5" id="linked-folder-items-panel">
            <h3 className="text-[10px] font-bold text-[#8c8c88] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Layers size={11} className="text-[#1a1a1a]" />
              <span>Project space items: {proj.name}</span>
            </h3>

            {linkedItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="project-linked-grid">
                {linkedItems.map((item) => (
                  <div key={item.knowledgeId} className="bg-white border border-[#e5e5e0] rounded-lg p-3.5 space-y-2 hover:border-[#1a1a1a] transition-all">
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span className="px-1.5 py-0.5 bg-[#f0f0ed] text-[#1a1a1a] rounded uppercase font-bold text-[8px] tracking-wider">{item.source}</span>
                      <span className="text-[#8c8c88]">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    <h5 className="text-[11px] font-bold text-[#1a1a1a] leading-snug line-clamp-2">{item.summary}</h5>
                    
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-stone-100 mt-2">
                      {item.topics.map(t => (
                        <span key={t} className="text-[9px] text-[#73736e] font-mono">#{t}</span>
                      ))}
                      {item.tools.map(tool => (
                        <span key={tool} className="text-[9px] px-1 bg-black text-white rounded font-mono">[ {tool} ]</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#8c8c88] italic py-4 font-mono leading-relaxed">No database connections mapped to this project directory yet. Share a social reel or write comments targeting this name.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

