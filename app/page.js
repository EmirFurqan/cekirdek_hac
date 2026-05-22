'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const router = useRouter();

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/room/${roomId.trim().toLowerCase()}`);
    }
  };

  const handleCreateRandom = () => {
    // Generate a clean random 7-character room identifier
    const randomId = Math.random().toString(36).substring(2, 9);
    router.push(`/room/${randomId}`);
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-zinc-900 to-black text-white font-sans p-6 relative overflow-hidden">
      {/* Background Ambient Glow Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <main className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl transition-all duration-300 hover:border-white/15">
        {/* Logo and Intro Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/20 mb-4 animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"></path>
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            PttVoice
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-light">
            Düşük Gecikmeli Canlı Push-to-Talk Ses Odaları
          </p>
        </div>

        {/* Join Room Form */}
        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="room-id" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Oda ID (Room ID)
            </label>
            <input
              id="room-id"
              type="text"
              required
              placeholder="Örn: muhabbet-odasi"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all text-center font-medium tracking-wide"
            />
          </div>

          <button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-2xl shadow-lg shadow-cyan-500/25 transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            Odaya Katıl
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"></path>
            </svg>
          </button>
        </form>

        {/* Dynamic Divider */}
        <div className="relative flex py-6 items-center">
          <div className="flex-grow border-t border-white/5"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase tracking-widest font-bold">veya</span>
          <div className="flex-grow border-t border-white/5"></div>
        </div>

        {/* Quick Random Room Generator */}
        <button
          onClick={handleCreateRandom}
          className="w-full h-12 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-2xl transition-all duration-300 transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path>
          </svg>
          Rastgele Oda Oluştur
        </button>
      </main>

      {/* Footer Details */}
      <footer className="mt-12 text-xs text-slate-600 tracking-wider">
        WebRTC & Socket.io • Düşük Gecikmeli P2P Ses
      </footer>
    </div>
  );
}
