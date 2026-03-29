/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#3a1510] blur-[120px] opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#ff4e00] blur-[120px] opacity-20" />
      </div>

      <div className="relative z-10 max-w-xl w-full">
        <div className="backdrop-blur-3xl bg-white/[0.03] border border-white/[0.08] rounded-[40px] p-10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-5xl font-light tracking-tighter text-white mb-2 font-serif italic">
                OTP <span className="text-[#ff4e00]">Bot</span>
              </h1>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40 font-medium">
                Premium Distribution System
              </p>
            </div>
            <div className="relative">
              <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#ff4e00] animate-ping absolute" />
                <div className="w-2 h-2 rounded-full bg-[#ff4e00]" />
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">System Status</p>
                <p className="text-xl font-light text-white">Active</p>
              </div>
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Admin ID</p>
                <p className="text-xl font-light text-white font-mono">...4774</p>
              </div>
            </div>

            <div className="p-8 rounded-[32px] bg-gradient-to-br from-[#ff4e00]/10 to-transparent border border-[#ff4e00]/20">
              <h3 className="text-lg font-medium text-white mb-4">Live Operations</h3>
              <p className="text-sm text-white/60 leading-relaxed mb-6">
                The Telegram bot is currently processing requests and managing the number database in real-time.
              </p>
              <div className="flex gap-3">
                <a 
                  href="https://t.me/dxaotpzone" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 py-4 bg-white text-black rounded-2xl text-center text-sm font-bold hover:bg-[#ff4e00] hover:text-white transition-all duration-500"
                >
                  Join Community
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="h-[1px] w-24 bg-white/10" />
          <p className="text-[10px] uppercase tracking-[0.4em] text-white/20 font-semibold">
            Developed by Developer X Asik
          </p>
        </div>
      </div>
    </div>
  );
}

