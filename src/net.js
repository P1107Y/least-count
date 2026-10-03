import { useCallback, useEffect, useRef, useState } from 'react';

const DEVICE_KEY = 'lc.deviceId';
const NAME_KEY = 'lc.name';

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: identity just won't survive a refresh */
  }
};

// FR-2: a device identifier so a refresh returns the player to their seat.
export const getDeviceId = () => {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
    safeSet(DEVICE_KEY, id);
  }
  return id;
};

export const getSavedName = () => safeGet(NAME_KEY) || '';
export const saveName = (name) => safeSet(NAME_KEY, name);

const socketUrl = () => `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useGameSocket() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState(null);
  const [you, setYou] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let timer = null;

    const connect = () => {
      const ws = new WebSocket(socketUrl());
      socketRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'hello', deviceId: getDeviceId() }));
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === 'state') {
          setClockOffset(data.serverNow - Date.now());
          setRoom(data.room);
          setYou(data.you);
          setReady(true);
        } else if (data.type === 'error') {
          setError({ message: data.message, at: Date.now() });
        } else if (data.type === 'kicked' || data.type === 'replaced') {
          setNotice({ message: data.message, at: Date.now() });
          setRoom(null);
          setYou(null);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        // Back off gently; the server holds the seat for 60 s (FR-29).
        const delay = Math.min(5000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((payload) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError({ message: 'Not connected to the server yet. Retrying…', at: Date.now() });
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return { connected, ready, room, you, error, notice, clockOffset, send, clearError, clearNotice };
}
