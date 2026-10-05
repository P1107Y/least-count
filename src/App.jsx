import { useEffect, useState } from 'react';
import { useGameSocket, getSavedName } from './net.js';
import { isMuted, setMuted, play } from './sound.js';
import Home from './screens/Home.jsx';
import BotSetup from './screens/BotSetup.jsx';
import Lobby from './screens/Lobby.jsx';
import HowToPlay from './screens/HowToPlay.jsx';
import Results from './screens/Results.jsx';
import Game from './screens/Game.jsx';

const readInviteCode = () => {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return code.length === 6 ? code : '';
};

const clearInviteFromUrl = () => {
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
};

function Toasts({ error, notice, clearError, clearNotice }) {
  useEffect(() => {
    if (!error) return undefined;
    play('error');
    const t = setTimeout(clearError, 4500);
    return () => clearTimeout(t);
  }, [error, clearError]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(clearNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);
  return (
    <div className="toasts" aria-live="assertive">
      {error && (
        <div className="toast toast-error" role="alert">
          <span>{error.message}</span>
          <button type="button" className="toast-close" onClick={clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="toast toast-info" role="status">
          <span>{notice.message}</span>
          <button type="button" className="toast-close" onClick={clearNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const net = useGameSocket();
  const { room, you, send, connected, ready } = net;
  const [view, setView] = useState('home'); // home | bots | howto (only when not in a room)
  const [inviteCode, setInviteCode] = useState(readInviteCode);
  const [dismissedResults, setDismissedResults] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (room) {
      clearInviteFromUrl();
      setInviteCode('');
    } else {
      setView((v) => (v === 'howto' || v === 'bots' ? v : 'home'));
    }
  }, [room?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const leave = () => {
    send({ type: 'leave' });
    setView('home');
  };

  let screen;
  if (!ready) {
    screen = (
      <div className="center-screen">
        <div className="spinner" aria-hidden="true" />
        <p>Connecting to the game server…</p>
      </div>
    );
  } else if (!room) {
    if (view === 'howto') screen = <HowToPlay onBack={() => setView('home')} />;
    else if (view === 'bots') screen = <BotSetup send={send} onBack={() => setView('home')} />;
    else screen = <Home send={send} inviteCode={inviteCode} onBots={() => setView('bots')} onHowTo={() => setView('howto')} defaultName={getSavedName()} connected={connected} />;
  } else if (room.status === 'playing' && room.game) {
    screen = <Game room={room} you={you} send={send} clockOffset={net.clockOffset} emotes={net.emotes} onLeave={leave} onHelp={() => setShowHelp(true)} />;
  } else if (room.lastResults && dismissedResults !== `${room.code}:${room.lastResults.gameNumber}`) {
    screen = (
      <Results
        results={room.lastResults}
        you={you}
        penalty={room.settings.showPenalty}
        onPlayAgain={() => setDismissedResults(`${room.code}:${room.lastResults.gameNumber}`)}
        onHome={leave}
      />
    );
  } else {
    screen = <Lobby room={room} you={you} send={send} onLeave={leave} />;
  }

  const inGame = room?.status === 'playing';

  return (
    <div className={`app ${inGame ? 'in-game' : ''}`}>
      {!inGame && (
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ♠
            </span>
            <span>Least Count</span>
          </div>
          <div className="topbar-right">
            {!connected && ready && <span className="pill pill-warn">Reconnecting…</span>}
            {room && (
              <button type="button" className="btn ghost small" onClick={() => setShowHelp(true)}>
                How to play
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={toggleMute} aria-pressed={muted}>
              {muted ? '🔇 Sound off' : '🔊 Sound on'}
            </button>
          </div>
        </header>
      )}
      {inGame && (
        <div className="game-floating-controls">
          {!connected && <span className="pill pill-warn">Reconnecting…</span>}
          <button type="button" className="btn ghost small" onClick={toggleMute} aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      )}
      <main className="app-main">{screen}</main>
      {showHelp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="How to play" onClick={() => setShowHelp(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <HowToPlay onBack={() => setShowHelp(false)} backLabel="Close" />
          </div>
        </div>
      )}
      <Toasts error={net.error} notice={net.notice} clearError={net.clearError} clearNotice={net.clearNotice} />
    </div>
  );
}
