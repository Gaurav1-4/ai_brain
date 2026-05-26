/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Bot, Send, Key, CheckCircle, HelpCircle, Loader2, Sparkles, AlertCircle, Info, ArrowUpRight } from "lucide-react";
import { BotSimMessage } from "../types";

interface TelegramProps {
  telegramConfig: {
    botToken?: string;
    webhookUrl?: string;
    isActive: boolean;
    setupAt?: string;
    chatIds: string[];
  };
  onSetupSuccess: () => void;
}

export function TelegramBotSetup({ telegramConfig, onSetupSuccess }: TelegramProps) {
  const [tokenInput, setTokenInput] = useState(telegramConfig.botToken || "");
  const [setupFeedback, setSetupFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Chat Simulator State
  const [simQuery, setSimQuery] = useState("");
  const [simMessages, setSimMessages] = useState<BotSimMessage[]>([
    {
      id: "m-init",
      sender: "bot",
      text: "🧠 *AI Brain Memory Layer simulation active!*\n\nSend /start to learn about instructions, share design URLs, or search your brain instantly right from Telegram.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [activeDebugSteps, setActiveDebugSteps] = useState<string[]>([
    "Simulator booted. Awaiting chat commands..."
  ]);
  const [simulating, setSimulating] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSetupFeedback(null);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tokenInput })
      });
      if (res.ok) {
        const data = await res.json();
        setSetupFeedback(data.message || "Bot setup updated!");
        onSetupSuccess();
      } else {
        throw new Error("Setup endpoint rejected token");
      }
    } catch (err: any) {
      setSetupFeedback(`Error: ${err.message || "Failed to update"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSimSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simQuery.trim()) return;

    const userText = simQuery;
    setSimQuery("");
    setSimulating(true);

    const userMsg: BotSimMessage = {
      id: `m-u-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setSimMessages(prev => [...prev, userMsg]);
    setActiveDebugSteps(["Handshaking simulator API.", "Sending command text..."]);

    try {
      const res = await fetch("/api/telegram/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "simulated-chat-channel",
          text: userText,
          senderName: "Personal Explorer"
        })
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg: BotSimMessage = {
          id: `m-b-${Date.now()}`,
          sender: "bot",
          text: data.replyMessage,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setSimMessages(prev => [...prev, botMsg]);
        if (data.steps && Array.isArray(data.steps)) {
          setActiveDebugSteps(data.steps);
        }
      } else {
        throw new Error("Simulator endpoint failed processing.");
      }
    } catch (err: any) {
      const errorMsg: BotSimMessage = {
        id: `m-sys-${Date.now()}`,
        sender: "system",
        text: `⚠️ Error processing: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setSimMessages(prev => [...prev, errorMsg]);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8" id="telegram-module-container">
      {/* Setup side */}
      <div className="bg-white border border-[#e5e5e0] rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between" id="telegram-setup-panel">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a1a] uppercase tracking-wider flex items-center gap-2 mb-1">
            <Bot className="text-[#1a1a1a]" size={16} />
            <span>Integrate Telegram Node Ingestion</span>
          </h2>
          <p className="text-xs text-[#73736e] mb-5">Instantly pipeline social reels of what you discover into memory. Zero-clicks tagging.</p>

          {/* Quick guide */}
          <div className="bg-[#fafaf9] border border-[#e5e5e0] border-dashed rounded-lg p-4 mb-5 text-xs text-stone-700 space-y-2">
            <span className="font-bold text-[#1a1a1a] text-[10px] uppercase tracking-widest block">🎓 15-Seconds Setup Blueprint</span>
            <div className="space-y-1.5 font-mono text-[11px] text-[#73736e] leading-relaxed">
              <p>1. Open Telegram and query for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-black font-bold underline inline-flex items-center gap-0.5">@BotFather <ArrowUpRight size={10} /></a>.</p>
              <p>2. Send <b>/newbot</b>, follow the name prompts, and copy the hash credentials.</p>
              <p>3. Paste the token below to register the active webhook automatically!</p>
            </div>
          </div>

          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#8c8c88] block mb-1">Telegram Bot Token Credentials</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="e.g. 719238910:AAF92X9zH8b8w7u_y8e..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="flex-1 bg-[#f0f0ed] border border-[#e5e5e0] text-[#1a1a1a] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-black focus:bg-white outline-none transition-all placeholder:text-[#8c8c88] font-mono"
                  disabled={saving}
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1a1a1a] text-white hover:bg-black text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 shrink-0 select-none cursor-pointer"
                  disabled={saving}
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                  <span>Save</span>
                </button>
              </div>
            </div>
          </form>

          {setupFeedback && (
            <div className="mt-4 p-3 bg-[#fafaf9] border border-[#e5e5e0] rounded-lg text-[#1a1a1a] text-xs font-mono leading-relaxed" id="webhook-api-feedback">
              {setupFeedback}
            </div>
          )}
        </div>

        {/* Current webhook state info */}
        <div className="mt-6 border-t border-[#e5e5e0] pt-4" id="telegram-webhook-info-block">
          <span className="text-[10px] uppercase font-bold text-[#8c8c88] tracking-widest block mb-2">Active webhook listener schema</span>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono leading-relaxed text-[#73736e]">
            <div>
              <span className="text-[#8c8c88] text-[10px] uppercase tracking-wider block font-bold">Status Indicator:</span>
              <span className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${telegramConfig.isActive ? "bg-[#fafaf9] text-black border border-[#e5e5e0]" : "bg-[#f0f0ed] text-[#8c8c88] border border-[#e5e5e0]"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${telegramConfig.isActive ? "bg-black animate-pulse" : "bg-stone-400"}`} />
                {telegramConfig.isActive ? "Live Receiver Polling" : "Inactive Setup"}
              </span>
            </div>

            <div>
              <span className="text-[#8c8c88] text-[10px] uppercase tracking-wider block font-bold">Bound Chat Channels:</span>
              <span className="text-black font-bold block mt-1 text-[11px] font-mono">
                {telegramConfig.chatIds.length} Channels mapped
              </span>
            </div>
          </div>
          {telegramConfig.webhookUrl && (
            <div className="mt-3 bg-[#f0f0ed] border border-[#e5e5e0] p-2 rounded text-[10px] font-mono text-[#73736e] break-all leading-tight">
              <b>webhook:</b> {telegramConfig.webhookUrl}
            </div>
          )}
        </div>
      </div>

      {/* Simulator Side */}
      <div className="bg-[#1a1a1a] border border-[#2d2d2a] rounded-xl p-5 shadow-lg h-[460px] flex flex-col justify-between text-[#f0f0ed]" id="telegram-sim-panel">
        <div className="flex items-center justify-between border-b border-[#2d2d2a] pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f0f0ed] animate-pulse" />
            <span className="text-[10px] font-bold text-white uppercase tracking-widest font-sans">Brain Simulator Terminal</span>
          </div>
          <span className="text-[8px] bg-[#2d2d2a] text-[#81817c] font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider select-none">
            Sandboxed Node pipeline
          </span>
        </div>

        {/* Main conversation split */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 min-w-0" id="sim-main-stage">
          {/* Chat Window Mock */}
          <div className="bg-black border border-[#2d2d2a] rounded-lg p-3 flex flex-col justify-between min-h-0 min-w-0" id="telegram-mock-ui">
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 text-xs h-full" id="sim-chat-scroller font-mono">
              {simMessages.map((m) => {
                let align = "justify-start";
                let bubble = "bg-[#2d2d2a] text-[#f0f0ed] rounded-tr-lg rounded-br-lg rounded-bl-lg";
                if (m.sender === "user") {
                  align = "justify-end";
                  bubble = "bg-white text-black rounded-tl-lg rounded-bl-lg rounded-br-lg font-medium";
                } else if (m.sender === "system") {
                  align = "justify-center";
                  bubble = "bg-[#1a1a1a] border border-[#2d2d2a] text-[#8c8c88] rounded-lg p-2 text-[10px]";
                }

                return (
                  <div key={m.id} className={`flex ${align}`}>
                    <div className={`p-2.5 max-w-[85%] whitespace-pre-wrap leading-tight text-[11px] shadow-xs font-mono ${bubble}`}>
                      {m.text}
                      <span className="text-[8px] text-[#81817c] block text-right mt-1 select-none font-mono">{m.timestamp}</span>
                    </div>
                  </div>
                );
              })}

              {simulating && (
                <div className="flex justify-start">
                  <div className="p-2.5 bg-[#2d2d2a] text-[#81817c] rounded-tr-lg rounded-br-lg rounded-bl-lg flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin text-white" />
                    <span className="text-[10px] font-mono">AI Brain mapping...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Simulated Input */}
            <form onSubmit={handleSimSend} className="mt-3 relative flex gap-1.5 border-t border-[#2d2d2a] pt-2 shrink-0">
              <input
                type="text"
                placeholder="type /start, /recent, or paste link..."
                value={simQuery}
                onChange={(e) => setSimQuery(e.target.value)}
                className="flex-1 bg-[#1a1a1a] border border-[#2d2d2a] rounded px-2.5 py-1.5 text-[11px] text-[#f0f0ed] focus:outline-none focus:ring-1 focus:ring-white placeholder:text-[#5e5e5a] font-mono outline-none"
                disabled={simulating}
              />
              <button
                type="submit"
                className="p-2 bg-white text-black rounded hover:bg-stone-200 transition-all shrink-0 cursor-pointer"
                disabled={simulating}
              >
                <Send size={12} />
              </button>
            </form>
          </div>

          {/* Logs of actual parsing steps panel */}
          <div className="bg-black border border-[#2d2d2a] rounded-lg p-3 flex flex-col justify-between min-h-0" id="sim-pipeline-logs">
            <div className="flex flex-col h-full justify-between">
              <div>
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#5e5e5a] block mb-2">Simulated Parser Debug logs</span>
                <div className="space-y-1.5 max-h-[290px] overflow-y-auto pr-1">
                  {activeDebugSteps.map((step, idx) => {
                    let color = "text-[#8c8c88] font-mono";
                    if (step.includes("successful") || step.includes("[5/5]")) color = "text-[#ffffff] font-mono font-bold";
                    else if (step.includes("Ingesting") || step.includes("handshake")) color = "text-stone-300 font-mono";
                    else if (step.includes("Command") || step.includes("Processing")) color = "text-stone-400 font-mono";

                    return (
                      <div key={idx} className="text-[9px] leading-tight flex items-start gap-1 p-0.5 border-b border-[#2d2d2a]/50">
                        <span className="text-[#5e5e5a] select-none">❯</span>
                        <span className={color}>{step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-[8px] text-[#5e5e5a] bg-black border-t border-[#2d2d2a]/65 pt-2 rounded leading-snug font-mono">
                💡 This terminal simulates the exact backend parser executing the whole extraction. Try pasting: <i>https://instagram.com/reel/C7uP8wV_ui8 Check this figma dashboard!</i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

