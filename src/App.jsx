import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, Timer, Trophy, Zap, Play, RotateCcw,
  Smartphone, Monitor, Hash, Plus, Trash2,
  Shield, Clock, ArrowRight, Lock, LogIn,
  List, Search, Filter, Eye, Ticket, CheckCircle
} from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  const [view, setView] = useState('LANDING');
  const [landingTab, setLandingTab] = useState('JOIN');
  const [role, setRole] = useState(null);
  const [roomCode, setRoomCode] = useState('');

  const [playerId, setPlayerId] = useState('');

  const [name, setName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [playerAccessCode, setPlayerAccessCode] = useState('');
  const [useAccessCode, setUseAccessCode] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  const [selectedTeam, setSelectedTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [regPlayerName, setRegPlayerName] = useState('');
  const [regPlayerTeam, setRegPlayerTeam] = useState('');

  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [existingRooms, setExistingRooms] = useState([]);

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

  useEffect(() => {
    const initAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.signInAnonymously();
      setUser(currentUser);

      let storedId = sessionStorage.getItem('buzzer_player_id');
      if (!storedId) {
        storedId = `player_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        sessionStorage.setItem('buzzer_player_id', storedId);
      }
      setPlayerId(storedId);
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!user || view !== 'LANDING') return;

    const loadExistingRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setExistingRooms(data);
      }
    };

    loadExistingRooms();

    const subscription = supabase
      .channel('rooms_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `host_id=eq.${user.id}`
      }, () => {
        loadExistingRooms();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, view]);

  useEffect(() => {
    if (!roomCode) return;

    const roomChannel = supabase
      .channel(`room:${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `code=eq.${roomCode}`
      }, async () => {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('code', roomCode)
          .maybeSingle();

        if (data) {
          const processedData = {
            ...data,
            isActive: data.is_active,
            adminPin: data.admin_pin,
            currentRound: data.current_round,
            startTime: data.start_time,
            allowedPlayerIds: data.allowed_player_ids
          };
          setGameState(prev => ({ ...prev, ...processedData }));
        } else if (!error || error.code === 'PGRST116') {
          if (view !== 'LANDING') {
            setError('Room closed or invalid');
            setView('LANDING');
          }
        }
      })
      .subscribe();

    const playersChannel = supabase
      .channel(`players:${roomCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_code=eq.${roomCode}`
      }, async () => {
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('room_code', roomCode);

        if (!error && data) {
          const processedPlayers = data.map(p => ({
            ...p,
            roomCode: p.room_code,
            joinedAt: p.joined_at,
            accessCode: p.access_code
          }));
          setPlayers(processedPlayers.sort((a, b) => (b.score || 0) - (a.score || 0)));
        }
      })
      .subscribe();

    const loadInitialData = async () => {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .maybeSingle();

      if (roomData) {
        const processedData = {
          ...roomData,
          isActive: roomData.is_active,
          adminPin: roomData.admin_pin,
          currentRound: roomData.current_round,
          startTime: roomData.start_time,
          allowedPlayerIds: roomData.allowed_player_ids
        };
        setGameState(prev => ({ ...prev, ...processedData }));
      }

      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('room_code', roomCode);

      if (playersData) {
        const processedPlayers = playersData.map(p => ({
          ...p,
          roomCode: p.room_code,
          joinedAt: p.joined_at,
          accessCode: p.access_code
        }));
        setPlayers(processedPlayers.sort((a, b) => (b.score || 0) - (a.score || 0)));
      }
    };

    loadInitialData();

    return () => {
      roomChannel.unsubscribe();
      playersChannel.unsubscribe();
    };
  }, [roomCode, view]);

  useEffect(() => {
    let interval;
    const slotsFilled = (gameState.buzzes || []).length >= 5;

    if (role === 'host' && gameState.isActive && gameState.timer > 0 && !slotsFilled && roomCode) {
      interval = setInterval(async () => {
        await supabase
          .from('rooms')
          .update({ timer: gameState.timer - 1 })
          .eq('code', roomCode);
      }, 1000);
    } else if (role === 'host' && gameState.timer === 0 && gameState.isActive && roomCode) {
      supabase
        .from('rooms')
        .update({ is_active: false })
        .eq('code', roomCode);
    }
    return () => clearInterval(interval);
  }, [role, gameState.isActive, gameState.timer, gameState.buzzes, roomCode]);

  const createGame = async () => {
    if (!user) {
      setError("Initializing...");
      return;
    }
    if (!adminPin || adminPin.length < 4) {
      setError("Please set a 4-digit Admin PIN.");
      return;
    }

    const code = generateRoomCode();
    setRoomCode(code);
    setRole('host');

    await supabase.from('rooms').insert({
      code: code,
      is_active: false,
      timer: 10,
      buzzes: [],
      teams: [],
      host_id: user.id,
      admin_pin: adminPin,
      current_round: 1,
      rounds: [{ id: 1, duration: 10, cutoff: 0 }],
      allowed_player_ids: null
    });

    setView('LOBBY');
  };

  const hostLogin = async () => {
    if (!user) {
      setError("Initializing...");
      return;
    }
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 4) {
      setError("Invalid Room Code");
      return;
    }

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (data) {
      if (String(data.admin_pin) === String(adminPin)) {
        setRoomCode(cleanCode);
        setRole('host');
        await supabase
          .from('rooms')
          .update({ host_id: user.id })
          .eq('code', cleanCode);
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
    if (!cleanCode || cleanCode.length !== 4) {
      setError('Invalid room code');
      return;
    }

    const { data: roomData, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (roomData) {
      setRoomCode(cleanCode);
      setRole('player');
      const processedData = {
        ...roomData,
        isActive: roomData.is_active,
        adminPin: roomData.admin_pin,
        currentRound: roomData.current_round,
        startTime: roomData.start_time,
        allowedPlayerIds: roomData.allowed_player_ids
      };
      setGameState(prev => ({ ...prev, ...processedData }));

      if (useAccessCode) {
        if (!playerAccessCode) {
          setError("Enter Player Code");
          return;
        }
        await loginWithPlayerCode(cleanCode, playerAccessCode);
      } else {
        if (!name.trim()) {
          setError('Enter Name');
          return;
        }
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
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_code', rCode)
        .eq('access_code', pCode)
        .maybeSingle();

      if (data) {
        sessionStorage.setItem('buzzer_player_id', data.id);
        setPlayerId(data.id);
        setName(data.name);
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
    if (!playerId) {
      setError("Initialization incomplete.");
      return;
    }
    try {
      await supabase.from('players').upsert({
        id: playerId,
        name: name,
        score: 0,
        room_code: code,
        team: team || null
      });
      setView('LOBBY');
    } catch (err) {
      console.error("Join Error:", err);
      setError("Failed to join.");
    }
  };

  const addTeam = async () => {
    if (!newTeamName.trim()) return;
    const updatedTeams = [...(gameState.teams || []), newTeamName.trim()];
    await supabase
      .from('rooms')
      .update({ teams: updatedTeams })
      .eq('code', roomCode);
    setNewTeamName('');
  };

  const removeTeam = async (teamToRemove) => {
    const updatedTeams = (gameState.teams || []).filter(t => t !== teamToRemove);
    await supabase
      .from('rooms')
      .update({ teams: updatedTeams })
      .eq('code', roomCode);
  };

  const registerPlayer = async () => {
    if (!regPlayerName.trim()) return;

    const pCode = generatePlayerCode();
    const newPlayerId = `player_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;

    await supabase.from('players').insert({
      id: newPlayerId,
      name: regPlayerName,
      team: regPlayerTeam || null,
      room_code: roomCode,
      access_code: pCode,
      score: 0
    });

    setRegPlayerName('');
    setRegPlayerTeam('');
  };

  const deletePlayer = async (pid) => {
    await supabase
      .from('players')
      .delete()
      .eq('id', pid);
  };

  const addRound = async () => {
    const nextId = (gameState.rounds || []).length + 1;
    const prevDuration = (gameState.rounds || [])[nextId - 2]?.duration || 10;
    const updatedRounds = [...(gameState.rounds || []), { id: nextId, duration: prevDuration, cutoff: 0 }];

    await supabase
      .from('rooms')
      .update({ rounds: updatedRounds })
      .eq('code', roomCode);
  };

  const updateRoundConfig = async (roundId, key, value) => {
    const val = parseInt(value) || 0;
    const updatedRounds = (gameState.rounds || []).map(r =>
      r.id === roundId ? { ...r, [key]: val } : r
    );

    await supabase
      .from('rooms')
      .update({ rounds: updatedRounds })
      .eq('code', roomCode);

    if (key === 'duration' && roundId === gameState.currentRound && !gameState.isActive) {
      await supabase
        .from('rooms')
        .update({ timer: val })
        .eq('code', roomCode);
    }
  };

  const selectRound = async (roundId) => {
    const targetRound = (gameState.rounds || []).find(r => r.id === roundId);

    let allowedIds = null;
    if (targetRound && targetRound.cutoff > 0) {
      allowedIds = players.slice(0, targetRound.cutoff).map(p => p.id);
    }

    if (targetRound) {
      await supabase
        .from('rooms')
        .update({
          current_round: roundId,
          timer: targetRound.duration,
          is_active: false,
          buzzes: [],
          allowed_player_ids: allowedIds
        })
        .eq('code', roomCode);
    }
  };

  const startRound = async () => {
    await supabase
      .from('rooms')
      .update({ is_active: true, buzzes: [], start_time: Date.now() })
      .eq('code', roomCode);
  };

  const resetRound = async () => {
    const currentDuration = (gameState.rounds || []).find(r => r.id === gameState.currentRound)?.duration || 10;
    await supabase
      .from('rooms')
      .update({ is_active: false, timer: currentDuration, buzzes: [] })
      .eq('code', roomCode);
  };

  const handleBuzz = async () => {
    if (!gameState.isActive || gameState.timer <= 0) return;
    if ((gameState.buzzes || []).some(b => b.id === playerId)) return;
    if ((gameState.buzzes || []).length >= 5) return;
    if (gameState.allowedPlayerIds && !gameState.allowedPlayerIds.includes(playerId)) return;

    const buzzEntry = {
      id: playerId,
      name: name,
      team: players.find(p => p.id === playerId)?.team,
      timestamp: Date.now()
    };

    const newBuzzes = [...(gameState.buzzes || []), buzzEntry];
    await supabase
      .from('rooms')
      .update({ buzzes: newBuzzes })
      .eq('code', roomCode);
  };

  const updateScore = async (targetPlayerId, delta) => {
    const currentPlayer = players.find(p => p.id === targetPlayerId);
    if (!currentPlayer) return;

    const newScore = (currentPlayer.score || 0) + delta;
    await supabase
      .from('players')
      .update({ score: newScore })
      .eq('id', targetPlayerId);
  };

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
                  <button onClick={() => setUseAccessCode(true)} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${useAccessCode ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>Has Code?</button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold pl-1">Room Code</label>
                    <input type="text" value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} placeholder="ABCD" maxLength={4} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white font-mono text-center tracking-widest uppercase focus:ring-2 focus:ring-yellow-400 focus:outline-none" />
                  </div>
                  {useAccessCode ? (
                    <div>
                      <label className="text-xs text-green-400 uppercase font-bold pl-1">Player Access Code</label>
                      <input type="text" inputMode="numeric" value={playerAccessCode} onChange={(e) => setPlayerAccessCode(e.target.value)} placeholder="0000" maxLength={6} className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white font-mono text-center tracking-widest focus:ring-2 focus:ring-green-400 focus:outline-none" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-blue-400 uppercase font-bold pl-1">Name</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter Name" className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>
                  )}
                  <button onClick={checkRoom} className={`w-full font-bold py-3 rounded-lg transition-all shadow-lg ${useAccessCode ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white`}>{useAccessCode ? 'Login with Code' : 'Join as Guest'}</button>
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
                      <div className="flex items-center gap-3"><span className="bg-yellow-500/20 text-yellow-500 text-xs font-mono px-1.5 py-0.5 rounded border border-yellow-500/30">{room.code}</span><div className="text-xs text-slate-400">{room.created_at ? new Date(room.created_at).toLocaleDateString() : 'Now'}</div></div><ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
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
                  <h3 className="font-bold text-green-400 flex items-center gap-2 mb-2 text-sm"><Ticket className="w-4 h-4" /> Pre-Register Player</h3>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={regPlayerName} onChange={(e) => setRegPlayerName(e.target.value)} placeholder="Name" className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-green-500" />
                    <select value={regPlayerTeam} onChange={(e) => setRegPlayerTeam(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs w-24"><option value="">No Team</option>{(gameState.teams || []).map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <button onClick={registerPlayer} className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-xs font-bold text-white">Add</button>
                  </div>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                    {players.filter(p => p.accessCode).map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-green-900/10 border border-green-500/20 p-2 rounded text-xs"><div className="flex flex-col"><span className="font-bold text-white">{p.name}</span>{p.team && <span className="text-[10px] text-slate-400">{p.team}</span>}</div><div className="flex items-center gap-2"><span className="bg-green-900 text-green-200 px-2 py-1 rounded font-mono font-bold tracking-widest">{p.accessCode}</span><button onClick={() => deletePlayer(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></div></div>
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
            {filteredPlayers.length === 0 ? <div className="text-center text-slate-500 mt-10">{players.length === 0 ? `No players yet. Share code: ${roomCode}` : 'No matching players found'}</div> : (
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
