import React from 'react';
import { ShieldCheck, Globe, SquaresFour, Sparkle, Info, Lock, Code, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react';
import logoPng from '../logo.png';

export function AboutView() {
  return (
    <div className="max-w-5xl p-8 space-y-8 animate-dropdown select-none" data-testid="about-view">
      {/* Header / Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#161925] via-[#1a1e2d] to-[#12141f] border border-[#2b3247] p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-[#0e1017] border border-amber-500/30 p-2.5 shadow-lg flex items-center justify-center shrink-0">
              <img src={logoPng} alt="Social Browser Logo" className="h-full w-auto object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">Social Browser</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs">
                  v0.2.0
                </span>
              </div>
              <p className="text-[14px] text-text-muted mt-1 leading-relaxed max-w-xl">
                The Next-Generation Multi-Profile Desktop Browser engineered for privacy, multi-account automation, and high-performance ad-blocking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto bg-[#0e1017] px-4 py-3 rounded-2xl border border-[#272e42] shrink-0 text-xs text-text-muted font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Electron + Brave AdBlock Rust</span>
          </div>
        </div>
      </div>

      {/* Feature Bento Grid */}
      <section className="space-y-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-faint px-1">
          Core Browser Architecture
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Brave AdBlock */}
          <div className="rounded-2xl bg-[#161925] border border-[#2b3247] p-5 hover:border-emerald-500/40 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheck size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Brave AdBlock Engine</h3>
                <p className="text-xs text-emerald-400/80 font-medium">Rust-powered network filter</p>
              </div>
            </div>
            <p className="text-[13px] text-text-muted leading-relaxed">
              Integrates high-performance network request filtering based on Brave's <code className="text-amber-300 font-mono text-xs">adblock-rust</code> engine with EasyList and EasyPrivacy rulesets to block intrusive ads, trackers, and popup scripts automatically.
            </p>
          </div>

          {/* Card 2: Multi-Profile Isolation */}
          <div className="rounded-2xl bg-[#161925] border border-[#2b3247] p-5 hover:border-amber-500/40 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                <Globe size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Multi-Profile Isolation</h3>
                <p className="text-xs text-amber-400/80 font-medium">Isolated cookie & partition sandboxing</p>
              </div>
            </div>
            <p className="text-[13px] text-text-muted leading-relaxed">
              Run multiple browser profiles simultaneously with separated session partitions, proxies, and localStorage. Manage dozens of accounts without cross-cookie contamination.
            </p>
          </div>

          {/* Card 3: Workspace & Groups */}
          <div className="rounded-2xl bg-[#161925] border border-[#2b3247] p-5 hover:border-sky-500/40 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-105 transition-transform">
                <SquaresFour size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Workspaces & Tab Groups</h3>
                <p className="text-xs text-sky-400/80 font-medium">Flexible multi-tenant organization</p>
              </div>
            </div>
            <p className="text-[13px] text-text-muted leading-relaxed">
              Group accounts, client profiles, and social tabs into organized workspaces. Seamlessly switch contexts between clients, team projects, or personal accounts in one click.
            </p>
          </div>

          {/* Card 4: RAG AI Assistant */}
          <div className="rounded-2xl bg-[#161925] border border-[#2b3247] p-5 hover:border-purple-500/40 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                <Sparkle size={22} weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Local RAG AI Assistant</h3>
                <p className="text-xs text-purple-400/80 font-medium">Smart content draft generation</p>
              </div>
            </div>
            <p className="text-[13px] text-text-muted leading-relaxed">
              Built-in local vector embeddings powered by SQLite-vec for draft generation, past post reference retrieval, and automated content scheduling across social channels.
            </p>
          </div>
        </div>
      </section>

      {/* Licenses & Open Source Disclosures */}
      <section className="space-y-4">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-faint px-1">
          Open Source License Disclosures
        </h2>
        <div className="rounded-2xl bg-[#161925] border border-[#2b3247] p-6 space-y-4">
          <div className="border-b border-[#2b3145] pb-4">
            <div className="flex items-center gap-2 text-white font-bold text-[14.5px]">
              <Code size={18} className="text-amber-400" />
              <span>1. Mozilla Public License 2.0 (MPL-2.0)</span>
            </div>
            <p className="text-[12.5px] text-text-muted leading-relaxed mt-1.5 pl-6">
              Brave <code className="text-amber-300 font-mono">adblock-rust</code> filter engine components integrated within Social Browser are licensed under the Mozilla Public License v2.0. Copyright © Brave Software Inc. All rights reserved.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-white font-bold text-[14.5px]">
              <Code size={18} className="text-amber-400" />
              <span>2. MIT License</span>
            </div>
            <p className="text-[12.5px] text-text-muted leading-relaxed mt-1.5 pl-6">
              Copyright © Social Browser Contributors. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
