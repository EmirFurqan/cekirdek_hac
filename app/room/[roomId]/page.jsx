'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';

// Polyfill global for simple-peer in the browser environment
if (typeof window !== 'undefined') {
  window.global = window;
}

// Remote stream renderer component for flawless DOM audio mounting
const RemoteAudio = ({ stream }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

// ==========================================
// Web Audio API Sound Synthesizer Helpers
// ==========================================

// Double-beep "chirp" for PTT activation
const playPttStart = () => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Beep 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain1.gain.setValueAtTime(0.04, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.08);

    // Beep 2 slightly arpeggiated
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1175, ctx.currentTime); // D6 note
      gain2.gain.setValueAtTime(0.04, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.08);
    }, 55);
  } catch (e) {
    console.warn('Audio synthesis block:', e);
  }
};

// Sawtooth-decay squelch sound for PTT release
const playPttEnd = () => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('Audio synthesis block:', e);
  }
};

// Rich, metallic, C-major arpeggiated bell chime
const playChime = () => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 chord
    
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = now + idx * 0.05; // 50ms stagger
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.1);
    });
  } catch (e) {
    console.warn('Audio synthesis block:', e);
  }
};

// Play dynamic custom audio file from public folder
const playAudioEffect = (effectName) => {
  if (typeof window === 'undefined') return;
  try {
    if (effectName === 'multezem') {
      const audio = new Audio('/mültezem.mp3');
      audio.volume = 0.8;
      audio.play().catch((err) => {
        console.warn('Failed to play custom audio effect:', err);
      });
    }
  } catch (e) {
    console.warn('Audio synthesis block:', e);
  }
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId || '';

  // Peer & Socket References
  const socketRef = useRef(null);
  const peersRef = useRef({}); // { socketId: PeerInstance }
  const localStreamRef = useRef(null);

  // States
  const [localStream, setLocalStream] = useState(null);
  const [peersList, setPeersList] = useState([]); // [ { socketId, stream } ]
  const [participants, setParticipants] = useState([]); // [ { id, username }, ... ]
  const [speakers, setSpeakers] = useState({}); // { socketId: isSpeaking }
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micState, setMicState] = useState('unauthorized'); // 'unauthorized' | 'ready' | 'error'
  const [PeerConstructor, setPeerConstructor] = useState(null);
  
  // Custom Username State
  const [username, setUsername] = useState('Anonim');

  // Load username or prompt if missing on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('simple-peer').then((module) => {
        setPeerConstructor(() => module.default);
      }).catch(err => {
        console.error('Failed to load simple-peer library', err);
      });

      const saved = localStorage.getItem('ptt_username');
      if (saved) {
        setUsername(saved);
      } else {
        const prompted = prompt("Lütfen odaya katılmadan önce bir kullanıcı adı girin:", "Anonim");
        const finalName = prompted ? prompted.trim() : "Anonim";
        localStorage.setItem('ptt_username', finalName);
        setUsername(finalName);
      }
    }
  }, []);

  // Main lifecycle cleanup
  useEffect(() => {
    return () => {
      // Disconnect Socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Destroy all active RTC peer connections
      for (const id in peersRef.current) {
        if (peersRef.current[id]) {
          peersRef.current[id].destroy();
        }
      }
      peersRef.current = {};
      
      // Release local microphone stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Requests microphone permission and initializes signaling connections
  const activateMicrophone = async () => {
    if (!PeerConstructor) {
      alert('Ses kütüphanesi yükleniyor, lütfen birkaç saniye sonra tekrar deneyin.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(
        "Mikrofon erişimi engellendi!\n\n" +
        "Tarayıcı güvenlik kuralları gereği, mikrofon ve kamera erişimi yalnızca güvenli bağlantılarda (HTTPS veya localhost) kullanılabilir.\n\n" +
        "Mobil cihazdan yerel IP (http://192.168.21.62:3000) ile test etmek için:\n" +
        "1. Bilgisayarınızda 'ngrok http 3000' veya benzeri bir tünel kullanarak güvenli HTTPS bağlantısı alabilirsiniz.\n" +
        "2. Veya Chrome mobil tarayıcısında 'chrome://flags/#unsafely-treat-insecure-origin-as-secure' adresine gidip yerel IP adresinizi (http://192.168.21.62:3000) ekleyebilirsiniz."
      );
      setMicState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Disable audio track initially (Standard Push-to-Talk rule)
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicState('ready');

      // Initialize Socket connection
      socketRef.current = getSocket();
      socketRef.current.connect();

      // Join current audio room with our custom username
      socketRef.current.emit('join-room', { roomId, username });

      // Listeners for WebRTC signaling
      socketRef.current.on('all-users', (users) => {
        console.log('Received list of all users in room:', users);
        setParticipants(users);
        
        users.forEach((user) => {
          const peer = createPeer(user.id, socketRef.current.id, stream);
          peersRef.current[user.id] = peer;
        });
      });

      socketRef.current.on('user-joined', ({ signal, callerID, callerUsername }) => {
        console.log('User joined room, creating responder peer for:', callerUsername);
        setParticipants((prev) => {
          if (prev.some((p) => p.id === callerID)) return prev;
          return [...prev, { id: callerID, username: callerUsername }];
        });

        const peer = addPeer(signal, callerID, stream);
        peersRef.current[callerID] = peer;
      });

      socketRef.current.on('receiving-returned-signal', ({ signal, id }) => {
        console.log('Receiving returned signal from peer:', id);
        const peer = peersRef.current[id];
        if (peer) {
          peer.signal(signal);
        }
      });

      socketRef.current.on('user-speaking', ({ userId, isSpeaking }) => {
        setSpeakers((prev) => ({
          ...prev,
          [userId]: isSpeaking,
        }));
      });

      socketRef.current.on('receive-ping-sound', ({ senderId }) => {
        playChime();
        // Visually trigger speaking indicator briefly for the sender so we see who pinged
        setSpeakers((prev) => ({
          ...prev,
          [senderId]: true,
        }));
        setTimeout(() => {
          setSpeakers((prev) => ({
            ...prev,
            [senderId]: false,
          }));
        }, 1200);
      });

      socketRef.current.on('receive-audio-effect', ({ senderId, effectName }) => {
        playAudioEffect(effectName);
        // Visually trigger speaking indicator briefly
        setSpeakers((prev) => ({
          ...prev,
          [senderId]: true,
        }));
        setTimeout(() => {
          setSpeakers((prev) => ({
            ...prev,
            [senderId]: false,
          }));
        }, 2000);
      });

      socketRef.current.on('user-left', (userId) => {
        console.log('User left room, cleaning up socket:', userId);
        
        if (peersRef.current[userId]) {
          peersRef.current[userId].destroy();
          delete peersRef.current[userId];
        }

        setPeersList((prev) => prev.filter((p) => p.socketId !== userId));
        setParticipants((prev) => prev.filter((p) => p.id !== userId));
        setSpeakers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      });

    } catch (err) {
      console.error('Microphone activation failed:', err);
      setMicState('error');
    }
  };

  // Helper: Create an initiator peer connection (Caller)
  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new PeerConstructor({
      initiator: true,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (signal) => {
      socketRef.current.emit('sending-signal', {
        userToSignal,
        callerID,
        signal,
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Successfully connected and received stream from:', userToSignal);
      setPeersList((prev) => {
        if (prev.find((p) => p.socketId === userToSignal)) return prev;
        return [...prev, { socketId: userToSignal, stream: remoteStream }];
      });
    });

    peer.on('error', (err) => {
      console.error(`Peer ${userToSignal} error:`, err);
    });

    return peer;
  };

  // Helper: Create a responder peer connection (Receiver)
  const addPeer = (incomingSignal, callerID, stream) => {
    const peer = new PeerConstructor({
      initiator: false,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (signal) => {
      socketRef.current.emit('returning-signal', {
        signal,
        callerID,
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Successfully connected and received stream from (responder):', callerID);
      setPeersList((prev) => {
        if (prev.find((p) => p.socketId === callerID)) return prev;
        return [...prev, { socketId: callerID, stream: remoteStream }];
      });
    });

    peer.on('error', (err) => {
      console.error(`Peer ${callerID} error:`, err);
    });

    peer.signal(incomingSignal);

    return peer;
  };

  // Autoplay blocker workaround: Force play all HTML5 audio tags upon user gesture (mouseDown/touchStart)
  const unblockRemoteAudio = () => {
    try {
      const audios = document.querySelectorAll('audio');
      audios.forEach((audio) => {
        audio.play().catch((err) => {
          console.log('Audio autoplay unblocking ignored/already playing:', err);
        });
      });
    } catch (e) {
      console.warn('Autoplay unblock failed', e);
    }
  };

  // Turn local audio stream track ON
  const startSpeaking = () => {
    if (localStreamRef.current && micState === 'ready') {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        setIsSpeaking(true);
        playPttStart(); // Play military start beep
        unblockRemoteAudio(); // UNBLOCK iOS/Autoplay Safari audio
        
        // Notify others that we started speaking
        if (socketRef.current) {
          socketRef.current.emit('speaking-state', { roomId, isSpeaking: true });
        }
      }
    }
  };

  // Turn local audio stream track OFF
  const stopSpeaking = () => {
    if (localStreamRef.current && micState === 'ready') {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        setIsSpeaking(false);
        playPttEnd(); // Play squelch end beep

        // Notify others that we stopped speaking
        if (socketRef.current) {
          socketRef.current.emit('speaking-state', { roomId, isSpeaking: false });
        }
      }
    }
  };

  // Play chime locally and notify other users in the room
  const sendChimePing = () => {
    if (socketRef.current && micState === 'ready') {
      playChime();
      socketRef.current.emit('send-ping-sound', { roomId });
    }
  };

  // Play custom audio effect locally and notify other users in the room
  const sendAudioEffect = (effectName) => {
    if (socketRef.current && micState === 'ready') {
      playAudioEffect(effectName);
      socketRef.current.emit('send-audio-effect', { roomId, effectName });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-slate-950 via-zinc-900 to-black text-white font-sans overflow-hidden select-none">
      {/* Background Ambience */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full blur-3xl -z-10 pointer-events-none transition-all duration-700 ${isSpeaking ? 'bg-rose-500/10' : 'bg-cyan-500/5'}`} />

      {/* Top Header Section */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"></path>
          </svg>
          Geri Dön
        </button>

        <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider text-slate-300 flex items-center gap-2 select-text">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          ODA: {roomId.toUpperCase()}
        </div>
      </header>

      {/* Dynamic Render of Remote audio DOM element attachments */}
      {peersList.map((peer) => (
        <RemoteAudio key={peer.socketId} stream={peer.stream} />
      ))}

      {/* Main Core Section */}
      <main className="flex-1 max-w-lg w-full mx-auto px-6 flex flex-col items-center justify-center gap-12 z-10">
        {micState === 'unauthorized' ? (
          /* Mic Activation Flow Card */
          <div className="w-full text-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="inline-flex p-4 bg-cyan-500/10 text-cyan-400 rounded-2xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"></path>
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Mikrofon Erişim İzni</h2>
              <p className="text-sm text-slate-400 font-light">
                Odadaki diğer kullanıcılarla konuşabilmek için mikrofonunuzu aktifleştirmeniz gerekmektedir.
              </p>
            </div>
            <button
              onClick={activateMicrophone}
              className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-2xl shadow-lg shadow-cyan-500/25 transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              Mikrofonu Aktifleştir
            </button>
          </div>
        ) : micState === 'error' ? (
          /* Mic Access Denied Flow Card */
          <div className="w-full text-center bg-rose-500/5 border border-rose-500/20 rounded-3xl p-8 space-y-6">
            <div className="inline-flex p-4 bg-rose-500/10 text-rose-400 rounded-2xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"></path>
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-rose-400">Mikrofon İzni Reddedildi</h2>
              <p className="text-sm text-slate-400 font-light">
                Lütfen tarayıcınızın adres çubuğundaki kilit simgesine tıklayarak mikrofon izinlerini etkinleştirin ve sayfayı yenileyin.
              </p>
            </div>
          </div>
        ) : (
          /* Realtime Push-to-Talk Interactive Console */
          <div className="flex flex-col items-center gap-12 w-full">
            {/* The Massive PTT Button */}
            <div className="relative flex items-center justify-center">
              {/* Concentric Ripple Waves on Speaking */}
              {isSpeaking && (
                <>
                  <div className="absolute w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] bg-rose-500/20 rounded-full animate-ping pointer-events-none" />
                  <div className="absolute w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] bg-rose-500/10 rounded-full animate-pulse pointer-events-none" />
                </>
              )}

              <button
                onMouseDown={startSpeaking}
                onMouseUp={stopSpeaking}
                onMouseLeave={stopSpeaking}
                onTouchStart={(e) => {
                  e.preventDefault(); // Prevents double click / zoom
                  startSpeaking();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  stopSpeaking();
                }}
                className={`w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] rounded-full border flex flex-col items-center justify-center gap-3 transition-all duration-300 select-none shadow-2xl cursor-pointer ${
                  isSpeaking
                    ? 'bg-gradient-to-tr from-rose-600 to-red-500 border-rose-400/40 text-white scale-[1.05] shadow-red-500/35'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-cyan-500/30 text-slate-300 shadow-black/50'
                }`}
              >
                <div className={`p-4 rounded-full transition-colors duration-300 ${isSpeaking ? 'bg-white/10' : 'bg-slate-800'}`}>
                  <svg className={`w-8 h-8 sm:w-10 sm:h-10 ${isSpeaking ? 'text-white' : 'text-cyan-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"></path>
                  </svg>
                </div>
                <div className="text-center">
                  <span className="block text-sm font-bold uppercase tracking-wider">
                    {isSpeaking ? 'Konuşun' : 'Basılı Tut'}
                  </span>
                  <span className="block text-[10px] text-slate-400/80 mt-0.5">
                    {isSpeaking ? 'Odadakiler Duyuyor' : 'Mikrofon Kapalı'}
                  </span>
                </div>
              </button>
            </div>

            {/* Instruction Indicator */}
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold tracking-wide">
                {isSpeaking ? 'Mikrofonunuz Canlı!' : 'Konuşmak İçin Düğmeye Basılı Tutun'}
              </p>
              <p className="text-xs text-slate-500">
                Bıraktığınızda ses iletimi otomatik olarak sonlanacaktır.
              </p>
            </div>

            {/* Action buttons / Soundboard */}
            <div className="flex flex-wrap gap-4 justify-center items-center">
              {/* Chime soundboard trigger */}
              <button
                onClick={sendChimePing}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/20 rounded-2xl text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-all duration-300 transform active:scale-95 shadow-md cursor-pointer"
              >
                <svg className="w-4 h-4 text-cyan-400 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a9.04 9.04 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5M19 13a7 7 0 1 1-14 0c0-1.127.098-2.233.287-3.308L5.75 6.25h12.5l.463 3.442A11.957 11.957 0 0 0 19 13Z"></path>
                </svg>
                Zil Çal
              </button>

              {/* Mültezem custom audio effect trigger */}
              <button
                onClick={() => sendAudioEffect('multezem')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:text-white transition-all duration-300 transform active:scale-95 shadow-md cursor-pointer"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"></path>
                </svg>
                Mültezem Sesi Çal
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Connected Participants Section */}
      {micState === 'ready' && (
        <section className="w-full max-w-xl mx-auto px-6 py-10 border-t border-white/5 bg-black/20 backdrop-blur-md">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center justify-between">
            <span>Odadakiler ({participants.length + 1})</span>
            <span className="text-[10px] text-slate-600 bg-white/5 border border-white/5 px-2 py-0.5 rounded">
              Gecikme: Düşük
            </span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Local User */}
            <div className={`p-4 rounded-2xl bg-white/5 border transition-all duration-300 flex items-center gap-3 relative ${isSpeaking ? 'border-rose-500/40 shadow-md shadow-rose-500/5' : 'border-white/5'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase ${isSpeaking ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white' : 'bg-slate-800 text-cyan-400'}`}>
                {username.substring(0, 2)}
              </div>
              <div className="truncate min-w-0">
                <span className="block text-xs font-bold text-white truncate">{username}</span>
                <span className="block text-[10px] text-slate-500">
                  {isSpeaking ? 'Konuşuyor' : 'Sessiz'}
                </span>
              </div>
              
              {/* Mic Icon indicator for local speaker */}
              {isSpeaking && (
                <span className="absolute top-3 right-3 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
            </div>

            {/* Remote Participants */}
            {participants.map((participant, idx) => {
              const socketId = participant.id;
              const pUsername = participant.username;
              const remoteIsSpeaking = !!speakers[socketId];
              return (
                <div
                  key={socketId}
                  className={`p-4 rounded-2xl bg-white/5 border transition-all duration-300 flex items-center gap-3 relative ${
                    remoteIsSpeaking
                      ? 'border-rose-500/40 shadow-md shadow-rose-500/5'
                      : 'border-white/5'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                    remoteIsSpeaking
                      ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white animate-pulse'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {pUsername.substring(0, 2)}
                  </div>
                  <div className="truncate min-w-0">
                    <span className="block text-xs font-bold text-slate-300 truncate">{pUsername}</span>
                    <span className="block text-[10px] text-slate-500">
                      {remoteIsSpeaking ? 'Konuşuyor' : 'Sessiz'}
                    </span>
                  </div>

                  {/* Mic Icon indicator for remote speaker */}
                  {remoteIsSpeaking && (
                    <span className="absolute top-3 right-3 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
