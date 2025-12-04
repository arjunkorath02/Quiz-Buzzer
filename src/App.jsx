import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc, 
  onSnapshot, 
  increment,
  serverTimestamp,
  arrayUnion,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';
import { 
  Users, Timer, Trophy, Zap, Play, RotateCcw, 
  Smartphone, Monitor, Hash, Plus, Trash2, 
  Shield, Clock, ArrowRight, Lock, LogIn, 
  List, Search, Filter, Eye, Ticket
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// 1. Go to console.firebase.google.com
// 2. Click Project Settings -> General -> Your Apps
// 3. Copy the config values into the object below:
const firebaseConfig = {
  apiKey: "AIzaSyA9xLe31ETdI-kqNsn0GTBLTXXVcwkdDHo", // Your Key
  authDomain: "quiz-buzzer-7c34a.firebaseapp.com",      // <--- UPDATE THIS
  projectId: "quiz-buzzer-7c34a",                       // <--- UPDATE THIS
  storageBucket: "quiz-buzzer-7c34a.firebasestorage.app",       // <--- UPDATE THIS
  messagingSenderId: "118624249440",                // <--- UPDATE THIS
  appId: "1:118624249440:web:f8032d69aa4299e970c505"                                // <--- UPDATE THIS
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Application ID for database paths
const appId = 'quiz-game-v1';

// Constants for Firestore Paths
const DATA_ROOT = 'data'; 
const PLAYERS_COLLECTION = 'players';
const ROOMS_COLLECTION = 'rooms';

// --- Utils ---
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generatePlayerCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // App State
  const [view, setView] = useState('LANDING'); 
  const [landingTab, setLandingTab] = useState('JOIN'); 
  const [role, setRole] = useState(null); 
  const [roomCode, setRoomCode] = useState('');
  
  // Identity State
  const [playerId, setPlayerId] = useState(''); 

  // Input State
  const [name, setName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [playerAccessCode, setPlayerAccessCode] = useState(''); 
  const [useAccessCode, setUseAccessCode] = useState(false); 
  const [adminPin, setAdminPin] = useState('');
  
  // Host Management State
  const [selectedTeam, setSelectedTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [regPlayerName, setRegPlayerName] = useState(''); 
  const [regPlayerTeam, setRegPlayerTeam] = useState('');
  
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [existingRooms, setExistingRooms] = useState([]);

  // Game Data State
  const [gameState, setGameState] = useState({
    isActive: false,
    timer: 0,
    buzzes: [],
    timerDuration: 10,
    teams: [], 
    startTime: 0,
    adminPin: '',
    currentRound: 1,
    rounds: [{ id: 1, duration: 10, cutoff: 0 }],
    allowedPlayerIds: null
  });
  
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');

  // --- Authentication ---
  useEffect(() => {
    const initAuth = async () => {
      // For standalone apps, anonymous auth is easiest
      await signInAnonymously(auth);
      
      let storedId = sessionStorage.getItem('buzzer_player_id');
      if (!storedId) {
        storedId = `player_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        sessionStorage.setItem('buzzer_player_id', storedId);
      }
      setPlayerId(storedId);
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Host: Find Previous Rooms ---
  useEffect(() => {
    if (!user || view !== 'LANDING') return;

    // Use artifacts/{appId}/public/data for public room lists
    const roomsRef = collection(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION);
    const q = query(roomsRef, where('hostId', '==', user.uid));

    const unsub = onSnapshot(q, (snapshot) => {
      const myRooms = snapshot.docs.map(d => ({
        code: d.id,
        ...d.data()
      }));
      // Sort in memory
      myRooms.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setExistingRooms(myRooms);
    });

    return () => unsub();
  }, [user, view]);

  // --- Firestore Listeners ---
  useEffect(() => {
    if (!roomCode) return;

    // Room Listener
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const unsubRoom = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.rounds) {
          data.rounds = [{ id: 1, duration: data.timerDuration || 10, cutoff: 0 }];
          data.currentRound = 1;
        }
        setGameState(prev => ({ ...prev, ...data }));
      } else {
        if (view !== 'LANDING') {
           setError('Room closed or invalid');
           setView('LANDING');
        }
      }
    }, (err) => console.error("Room Sync Error:", err));

    // Players Listener
    const playersRef = collection(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION);
    const q = query(playersRef, where('roomCode', '==', roomCode));
    
    const unsubPlayers = onSnapshot(q, (snapshot) => {
      const playerList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(playerList.sort((a, b) => (b.score || 0) - (a.score || 0)));
    }, (err) => console.error("Players Sync Error:", err));

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode, view]);

  // --- Host Logic: Timer Interval ---
  useEffect(() => {
    let interval;
    const slotsFilled = (gameState.buzzes || []).length >= 5;

    if (role === 'host' && gameState.isActive && gameState.timer > 0 && !slotsFilled && roomCode) {
      interval = setInterval(() => {
        const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
        updateDoc(roomRef, {
          timer: gameState.timer - 1
        }).catch(err => console.error("Timer fail", err));
      }, 1000);
    } else if (role === 'host' && gameState.timer === 0 && gameState.isActive && roomCode) {
      const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
      updateDoc(roomRef, { isActive: false }).catch(err => console.error("Timer end fail", err));
    }
    return () => clearInterval(interval);
  }, [role, gameState.isActive, gameState.timer, gameState.buzzes, roomCode]);


  // --- Actions ---

  const createGame = async () => {
    if (!user) { setError("Initializing..."); return; }
    if (!adminPin || adminPin.length < 4) { setError("Please set a 4-digit Admin PIN."); return; }
    
    const code = generateRoomCode();
    setRoomCode(code);
    setRole('host');
    
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, code);
    await setDoc(roomRef, {
      isActive: false,
      timer: 10, 
      buzzes: [],
      teams: [],
      createdAt: serverTimestamp(),
      hostId: user.uid,
      adminPin: adminPin,
      currentRound: 1,
      rounds: [{ id: 1, duration: 10, cutoff: 0 }],
      allowedPlayerIds: null
    });

    setView('LOBBY');
  };

  const hostLogin = async () => {
    if (!user) { setError("Initializing..."); return; }
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 4) { setError("Invalid Room Code"); return; }
    
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, cleanCode);
    const docSnap = await getDoc(roomRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (String(data.adminPin) === String(adminPin)) {
        setRoomCode(cleanCode);
        setRole('host');
        await updateDoc(roomRef, { hostId: user.uid });
        setView('LOBBY');
        setError('');
      } else {
        setError("Incorrect Admin PIN");
      }
    } else {
      setError("Room not found");
    }
  };

  const resumeGame = (code) => {
    setRoomCode(code);
    setRole('host');
    setView('LOBBY');
  };

  const checkRoom = async () => {
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 4) { setError('Invalid room code'); return; }

    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, cleanCode);
    const docSnap = await getDoc(roomRef);

    if (docSnap.exists()) {
      const roomData = docSnap.data();
      setRoomCode(cleanCode);
      setRole('player');
      setGameState(prev => ({ ...prev, ...roomData }));
      
      if (useAccessCode) {
        if (!playerAccessCode) { setError("Enter Player Code"); return; }
        await loginWithPlayerCode(cleanCode, playerAccessCode);
      } else {
        if (!name.trim()) { setError('Enter Name'); return; }
        if (roomData.teams && roomData.teams.length > 0) {
          setView('JOINING_TEAM');
        } else {
          await joinGame(cleanCode, null);
        }
      }
    } else {
      setError('Room not found!');
    }
  };

  const loginWithPlayerCode = async (rCode, pCode) => {
    try {
      // Find player by reading all players in room and filtering
      const playersRef = collection(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION);
      const q = query(playersRef, where('roomCode', '==', rCode));
      
      const querySnapshot = await new Promise((resolve, reject) => {
         const unsubscribe = onSnapshot(q, (snap) => {
           unsubscribe();
           resolve(snap);
         }, reject);
      });

      const match = querySnapshot.docs.find(d => d.data().accessCode === pCode);

      if (match) {
        const pData = match.data();
        const pId = match.id;
        sessionStorage.setItem('buzzer_player_id', pId);
        setPlayerId(pId);
        setName(pData.name);
        setView('LOBBY');
      } else {
        setError("Player code not found in this room.");
      }
    } catch (err) {
      console.error(err);
      setError("Login failed.");
    }
  };

  const joinGame = async (code, team) => {
    if (!playerId) { setError("Initialization incomplete."); return; }
    try {
      const playerRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION, playerId);
      await setDoc(playerRef, {
        name: name,
        score: 0,
        roomCode: code,
        team: team || null,
        joinedAt: serverTimestamp()
      }, { merge: true });
      setView('LOBBY');
    } catch (err) { console.error("Join Error:", err); setError("Failed to join."); }
  };

  // --- Host Management ---

  const addTeam = async () => {
    if (!newTeamName.trim()) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const updatedTeams = [...(gameState.teams || []), newTeamName.trim()];
    await updateDoc(roomRef, { teams: updatedTeams });
    setNewTeamName('');
  };

  const removeTeam = async (teamToRemove) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const updatedTeams = (gameState.teams || []).filter(t => t !== teamToRemove);
    await updateDoc(roomRef, { teams: updatedTeams });
  };

  const registerPlayer = async () => {
    if (!regPlayerName.trim()) return;
    
    const pCode = generatePlayerCode();
    // Create new player doc
    const newPlayerRef = doc(collection(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION));
    
    await setDoc(newPlayerRef, {
      name: regPlayerName,
      team: regPlayerTeam || null,
      roomCode: roomCode,
      accessCode: pCode,
      score: 0,
      createdAt: serverTimestamp()
    });
    
    setRegPlayerName('');
    setRegPlayerTeam('');
  };

  const deletePlayer = async (pid) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION, pid));
  };

  const assignPlayerTeam = async (targetPlayerId, newTeam) => {
    const playerRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION, targetPlayerId);
    await updateDoc(playerRef, { team: newTeam });
  };

  // --- Round Management ---

  const addRound = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const nextId = (gameState.rounds || []).length + 1;
    const prevDuration = (gameState.rounds || [])[nextId - 2]?.duration || 10;
    
    await updateDoc(roomRef, {
      rounds: arrayUnion({ id: nextId, duration: prevDuration, cutoff: 0 })
    });
  };

  const updateRoundConfig = async (roundId, key, value) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const val = parseInt(value) || 0;
    const updatedRounds = (gameState.rounds || []).map(r => 
      r.id === roundId ? { ...r, [key]: val } : r
    );
    await updateDoc(roomRef, { rounds: updatedRounds });
    
    if (key === 'duration' && roundId === gameState.currentRound && !gameState.isActive) {
      await updateDoc(roomRef, { timer: val });
    }
  };

  const selectRound = async (roundId) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const targetRound = (gameState.rounds || []).find(r => r.id === roundId);
    
    let allowedIds = null;
    if (targetRound && targetRound.cutoff > 0) {
      allowedIds = players.slice(0, targetRound.cutoff).map(p => p.id);
    }

    if (targetRound) {
      await updateDoc(roomRef, {
        currentRound: roundId,
        timer: targetRound.duration,
        isActive: false,
        buzzes: [],
        allowedPlayerIds: allowedIds
      });
    }
  };

  const startRound = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    await updateDoc(roomRef, { isActive: true, buzzes: [], startTime: Date.now() });
  };

  const resetRound = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const currentDuration = (gameState.rounds || []).find(r => r.id === gameState.currentRound)?.duration || 10;
    await updateDoc(roomRef, { isActive: false, timer: currentDuration, buzzes: [] });
  };

  const handleBuzz = async () => {
    if (!gameState.isActive || gameState.timer <= 0) return;
    if ((gameState.buzzes || []).some(b => b.id === playerId)) return;
    if ((gameState.buzzes || []).length >= 5) return;
    if (gameState.allowedPlayerIds && !gameState.allowedPlayerIds.includes(playerId)) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, ROOMS_COLLECTION, roomCode);
    const buzzEntry = {
      id: playerId,
      name: name,
      team: players.find(p => p.id === playerId)?.team,
      timestamp: Date.now()
    };

    await updateDoc(roomRef, {
      buzzes: arrayUnion(buzzEntry)
    });
  };

  const updateScore = async (targetPlayerId, delta) => {
    const playerRef = doc(db, 'artifacts', appId, 'public', DATA_ROOT, PLAYERS_COLLECTION, targetPlayerId);
    await updateDoc(playerRef, { score: increment(delta) });
  };

  // --- Render ---

  const myBuzzIndex = (gameState.buzzes || []).findIndex(b => b && b.id === playerId);
  const myRank = myBuzzIndex !== -1 ? myBuzzIndex + 1 : null;
  const isSlotsFull = (gameState.buzzes || []).length >= 5;
  const displayBuzzes = (gameState.buzzes || []).filter(b => b).slice(0, 5);
  const playerTeam = players.find(p => p.id === playerId)?.team;
  const isQualified = !gameState.allowedPlayerIds || gameState.allowedPlayerIds.includes(playerId);
  const filteredPlayers = players.filter(p => 
    (p.name || '').toLowerCase().includes(leaderboardSearch.toLowerCase()) || 
    (p.team || '').toLowerCase().includes(leaderboardSearch.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-900 text-white animate-pulse">Loading App...</div>;

  if (view === 'LANDING') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white font-sans">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
          <div className="bg-slate-900/50 p-6 flex flex-col items-center border-b border-slate-700">
             <Zap className="w-12 h-12 text-yellow-400 mb-2" />
             <h1 className="text-2xl font-bold">Quiz Buzzer</h1>
          </div>
          <div className="flex border-b border-slate-700">
            <button onClick={() => setLandingTab('JOIN')} className={`flex-1 py-3 text-sm font-bold transition-colors ${landingTab === 'JOIN' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'}`}>Join</button>
            <button onClick={() => setLandingTab('HOST_NEW')} className={`flex-1 py-3 text-sm font-bold transition-colors ${landingTab === 'HOST_NEW' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'}`}>New Game</button>
            <button onClick={() => setLandingTab('HOST_LOGIN')} className={`flex-1 py-3 text-sm font-bold transition-colors ${landingTab === 'HOST_LOGIN' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'}`}>Host Login</button>
          </div>
          <div className="p-6">
            {landingTab === 'JOIN' && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 mb-2">
                  <button onClick={() => setUseAccessCode(false)} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${!useAccessCode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Guest</button>
                  <button onClick={() => setUseAccessCode(true)} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${useAccessCode ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>Has Code?</button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold pl-1">Room Code</label>
                    <input type="text" value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} placeholder="ABCD" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white font-mono text-center tracking-widest uppercase focus:ring-2 focus:ring-yellow-400 focus:outline-none" />
                  </div>
                  {useAccessCode ? (
                    <div>
                      <label className="text-xs text-purple-400 uppercase font-bold pl-1">Player Access Code</label>
                      <input type="text" inputMode="numeric" value={playerAccessCode} onChange={(e) => setPlayerAccessCode(e.target.value)} placeholder="0000" maxLength={6} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white font-mono text-center tracking-widest focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-blue-400 uppercase font-bold pl-1">Name</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter Name" className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>
                  )}
                  <button onClick={checkRoom} className={`w-full font-bold py-3 rounded-lg transition-all shadow-lg ${useAccessCode ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'} text-white`}>{useAccessCode ? 'Login with Code' : 'Join as Guest'}</button>
                </div>
              </div>
            )}
            {landingTab === 'HOST_NEW' && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg text-xs text-yellow-200 mb-2">Create a new room with a secure PIN.</div>
                <div className="relative"><Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" /><input type="password" inputMode="numeric" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="Set Admin PIN (4 digits)" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-yellow-400 focus:outline-none font-mono tracking-widest" /></div>
                <button onClick={createGame} className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"><Monitor className="w-4 h-4" /> Create Game</button>
              </div>
            )}
            {landingTab === 'HOST_LOGIN' && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative"><Hash className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" /><input type="text" value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pl-10 text-white font-mono uppercase focus:ring-2 focus:ring-yellow-400 focus:outline-none" /></div>
                  <div className="relative"><Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" /><input type="password" inputMode="numeric" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="PIN" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pl-10 text-white font-mono tracking-widest focus:ring-2 focus:ring-yellow-400 focus:outline-none" /></div>
                </div>
                <button onClick={hostLogin} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"><LogIn className="w-4 h-4" /> Login</button>
              </div>
            )}
            {error && <div className="text-red-400 text-sm text-center mt-4 animate-pulse">{error}</div>}
            {existingRooms.length > 0 && landingTab === 'HOST_NEW' && (
              <div className="mt-6 pt-6 border-t border-slate-700 animate-in slide-in-from-bottom-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Your Recent Rooms</div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {existingRooms.map(room => (
                    <button key={room.code} onClick={() => resumeGame(room.code)} className="w-full bg-slate-900/50 hover:bg-slate-700 border border-slate-700 p-2 rounded-lg flex items-center justify-between text-left">
                      <div className="flex items-center gap-3"><span className="bg-yellow-500/20 text-yellow-500 text-xs font-mono px-1.5 py-0.5 rounded border border-yellow-500/30">{room.code}</span><div className="text-xs text-slate-400">{room.createdAt?.toMillis ? new Date(room.createdAt.toMillis()).toLocaleDateString() : 'Now'}</div></div><ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'JOINING_TEAM') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
          <h2 className="text-2xl font-bold text-center mb-6">Select Your Team</h2>
          <div className="grid grid-cols-1 gap-3 mb-6">
            {(gameState.teams || []).map(t => (
              <button key={t} onClick={() => setSelectedTeam(t)} className={`p-4 rounded-xl border text-left font-bold transition-all flex items-center justify-between ${selectedTeam === t ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>{t}{selectedTeam === t && <CheckCircle className="w-5 h-5" />}</button>
            ))}
          </div>
          <button onClick={() => joinGame(roomCode, selectedTeam)} disabled={!selectedTeam} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg disabled:opacity-50">Enter Game</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-500 text-slate-900 px-3 py-1 rounded-lg font-mono font-bold text-lg tracking-widest flex items-center gap-2"><Hash className="w-4 h-4" /> {roomCode}</div>
            <div className="flex items-center gap-2 text-slate-400"><h1 className="font-bold text-xl hidden sm:block">Quiz Buzzer</h1><span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-xs uppercase tracking-widest font-bold text-yellow-500">Round {gameState.currentRound || 1}</span></div>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium"><span className={`px-3 py-1 rounded-full border ${role === 'host' ? 'bg-blue-900/30 border-blue-700 text-blue-400' : 'bg-green-900/30 border-green-700 text-green-400'}`}>{role === 'host' ? 'HOST' : `PLAYER: ${name}`}</span>{role === 'player' && playerTeam && <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700 text-slate-300">Team: {playerTeam}</span>}<button onClick={() => window.location.reload()} className="text-slate-500 hover:text-white underline text-xs">Exit</button></div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 space-y-6">
          {role === 'host' && (
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-800 bg-slate-950/50 p-3 rounded-lg">
                  <h3 className="font-bold text-purple-400 flex items-center gap-2 mb-2 text-sm"><Ticket className="w-4 h-4" /> Pre-Register Player</h3>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={regPlayerName} onChange={(e) => setRegPlayerName(e.target.value)} placeholder="Name" className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500" />
                    <select value={regPlayerTeam} onChange={(e) => setRegPlayerTeam(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs w-24"><option value="">No Team</option>{(gameState.teams || []).map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <button onClick={registerPlayer} className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-xs font-bold text-white">Add</button>
                  </div>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                    {players.filter(p => p.accessCode).map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-purple-900/10 border border-purple-500/20 p-2 rounded text-xs"><div className="flex flex-col"><span className="font-bold text-white">{p.name}</span>{p.team && <span className="text-[10px] text-slate-400">{p.team}</span>}</div><div className="flex items-center gap-2"><span className="bg-purple-900 text-purple-200 px-2 py-1 rounded font-mono font-bold tracking-widest">{p.accessCode}</span><button onClick={() => deletePlayer(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></div></div>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-800 bg-slate-950/50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-300 flex items-center gap-2 text-sm"><List className="w-4 h-4" /> Rounds</h3><button onClick={addRound} className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded text-white flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button></div>
                  <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {(gameState.rounds || []).map(r => (
                      <div key={r.id} className={`flex items-center gap-2 text-xs p-1 rounded ${gameState.currentRound === r.id ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-slate-800 border border-slate-700'}`}>
                        <button onClick={() => selectRound(r.id)} className={`flex-1 text-left font-bold ${gameState.currentRound === r.id ? 'text-yellow-400' : 'text-slate-400 hover:text-white'}`}>Round {r.id}</button>
                        <div className="flex items-center gap-1 text-[10px]"><div className="flex items-center bg-slate-900 px-1 rounded border border-slate-700"><Clock className="w-3 h-3 text-slate-500 mr-1" /><input type="number" value={r.duration} onChange={(e) => updateRoundConfig(r.id, 'duration', e.target.value)} className="w-6 bg-transparent text-center focus:outline-none" /></div><div className="flex items-center bg-slate-900 px-1 rounded border border-slate-700" title="Top N Cutoff"><Filter className="w-3 h-3 text-slate-500 mr-1" /><input type="number" value={r.cutoff} onChange={(e) => updateRoundConfig(r.id, 'cutoff', e.target.value)} className="w-6 bg-transparent text-center focus:outline-none placeholder-slate-600" placeholder="All" /></div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-800 pt-3">
                 <h3 className="font-bold text-slate-300 flex items-center gap-2 mb-2 text-sm"><Shield className="w-4 h-4" /> Manage Teams</h3>
                 <div className="flex gap-2 mb-2">
                    <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Add Team Name" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-yellow-500 w-40" />
                    <button onClick={addTeam} className="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-xs font-bold">Add</button>
                    <div className="flex-1 flex gap-1 flex-wrap items-center ml-2">{(gameState.teams || []).map(t => (<span key={t} className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">{t}<button onClick={() => removeTeam(t)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></span>))}</div>
                 </div>
              </div>
            </div>
          )}
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
            {(displayBuzzes?.length > 0) && <div className="absolute inset-0 bg-yellow-500/5 pointer-events-none" />}
            <div className="flex flex-col items-center justify-center py-4">
              <div className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-2">Round {gameState.currentRound || 1} Timer</div>
              <div className={`text-6xl font-black mb-4 tabular-nums tracking-tighter ${gameState.timer <= 3 && gameState.isActive ? 'text-red-500 animate-pulse' : 'text-white'}`}>{gameState.timer}</div>
              <div className="w-full">
                {(displayBuzzes && displayBuzzes.length > 0) ? (
                   <div className="w-full max-w-lg mx-auto bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden">
                     <div className="bg-slate-800 p-2 text-xs font-bold text-slate-400 uppercase tracking-widest text-center border-b border-slate-700">Buzz Order (Top 5)</div>
                     {displayBuzzes.map((buzz, idx) => {
                       const isMe = buzz && buzz.id === playerId;
                       const startTime = gameState.startTime || (buzz ? buzz.timestamp : 0);
                       const reactionTime = buzz ? (buzz.timestamp - startTime) : 0;
                       const diff = (reactionTime / 1000).toFixed(2);
                       if (!buzz) return null;
                       return (
                         <div key={idx} className={`flex items-center p-3 border-b border-slate-700 last:border-0 ${isMe ? 'bg-blue-900/20' : ''}`}>
                           <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-slate-900 mr-3 ${idx === 0 ? 'bg-yellow-500' : 'bg-slate-400'}`}>{idx + 1}</div>
                           <div className="flex-1"><div className="font-bold text-white flex items-center gap-2">{buzz.name}{isMe && <span className="text-[10px] bg-blue-600 px-1.5 rounded text-white">YOU</span>}</div>{buzz.team && <div className="text-xs text-slate-400">{buzz.team}</div>}</div>
                           <div className="flex items-center gap-1 text-xs font-mono text-slate-400"><Clock className="w-3 h-3" />+{diff}s</div>
                         </div>
                       );
                     })}
                   </div>
                ) : gameState.isActive ? (
                  <div className="text-center"><div className="text-green-400 text-2xl font-bold tracking-widest animate-pulse">BUZZERS OPEN</div><div className="text-slate-500 text-sm mt-1">First 5 players to buzz get in!</div></div>
                ) : gameState.timer === 0 ? <div className="text-red-400 text-2xl font-bold text-center">TIME UP</div> : <div className="text-slate-500 text-center">Waiting for host...</div>}
              </div>
            </div>
            {role === 'host' && (
              <div className="bg-slate-800/50 rounded-xl p-4 mt-6 border border-slate-700">
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700 opacity-50 cursor-not-allowed"><Timer className="w-4 h-4 text-slate-400" /><span className="font-bold text-white text-lg">{gameState.timer}</span><span className="text-slate-400 text-sm">sec</span></div>
                  <button onClick={() => startRound()} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold transition-all active:scale-95 shadow-lg shadow-green-900/20"><Play className="w-4 h-4" /> Start</button>
                  <button onClick={resetRound} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold transition-all active:scale-95"><RotateCcw className="w-4 h-4" /> Reset</button>
                </div>
              </div>
            )}
          </div>
          {role === 'player' && (
            <div className="flex justify-center">
              {isQualified ? (
                <button onClick={handleBuzz} disabled={!gameState.isActive || !!myRank || isSlotsFull} className={`w-full max-w-sm aspect-square rounded-full flex flex-col items-center justify-center border-8 shadow-2xl transition-all duration-100 transform ${myRank ? 'bg-blue-600 border-blue-700 scale-100 cursor-default' : isSlotsFull ? 'bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed' : gameState.isActive ? 'bg-red-600 border-red-800 hover:bg-red-500 active:scale-95 active:border-red-900 cursor-pointer shadow-red-900/50' : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'}`}>
                  <div className="bg-white/10 w-full h-full rounded-full flex flex-col items-center justify-center backdrop-blur-sm"><Zap className={`w-24 h-24 mb-4 ${myRank ? 'text-white' : gameState.isActive && !isSlotsFull ? 'text-white' : 'text-slate-500'}`} /><span className="text-3xl font-black uppercase tracking-wider text-white drop-shadow-md">{myRank ? `RANK #${myRank}` : isSlotsFull ? 'LOCKED' : 'BUZZ'}</span></div>
                </button>
              ) : (
                <div className="w-full max-w-sm aspect-square rounded-full flex flex-col items-center justify-center border-8 border-slate-800 bg-slate-900 text-slate-500"><Eye className="w-16 h-16 mb-4 text-slate-600" /><span className="text-xl font-bold uppercase tracking-wider">Spectating</span><span className="text-xs mt-2 text-center px-8">You did not qualify for Round {gameState.currentRound}</span></div>
              )}
            </div>
          )}
        </div>
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl flex flex-col h-[500px] lg:h-auto overflow-hidden">
          <div className="p-4 bg-slate-800/50 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2 font-bold text-lg"><Trophy className="w-5 h-5 text-yellow-500" /> Leaderboard</div><div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded"><Users className="w-3 h-3" /> {players.length}</div></div>
            <div className="relative"><Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-500" /><input type="text" value={leaderboardSearch} onChange={(e) => setLeaderboardSearch(e.target.value)} placeholder="Search players..." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-8 pr-4 text-sm focus:outline-none focus:border-yellow-500 placeholder-slate-600 text-slate-200" /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {filteredPlayers.length === 0 ? <div className="text-center text-slate-500 mt-10">{players.length === 0 ? `No players yet. Share code: {roomCode}` : 'No matching players found'}</div> : (
              filteredPlayers.map((p, index) => {
                const isQual = !gameState.allowedPlayerIds || gameState.allowedPlayerIds.includes(p.id);
                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${(gameState.buzzes || []).some(b => b && b.id === p.id) ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-slate-800 border-slate-700'} ${!isQual ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-400'}`}>{index + 1}</div>
                      <div className="min-w-0">
                        <div className="font-bold flex items-center gap-2 truncate">{p.name}{p.id === playerId && <span className="text-[10px] bg-blue-600 px-1.5 rounded text-white flex-shrink-0">YOU</span>}{(gameState.buzzes || []).some(b => b && b.id === p.id) && <Zap className="w-4 h-4 text-yellow-400 fill-current animate-pulse flex-shrink-0" />}</div>
                        {p.team && <div className="text-xs text-slate-400 truncate flex items-center gap-1"><Shield className="w-3 h-3" /> {p.team}</div>}
                      </div>
                    </div>
                    {role === 'host' ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateScore(p.id, -0.5)} className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-red-400 flex items-center justify-center text-xs font-bold">-0.5</button>
                        <div className="w-10 text-center font-mono font-bold text-sm">{p.score}</div>
                        <button onClick={() => updateScore(p.id, 0.5)} className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-green-400 flex items-center justify-center text-xs font-bold">+0.5</button>
                      </div>
                    ) : <div className="font-mono text-xl font-bold text-yellow-500">{p.score}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
