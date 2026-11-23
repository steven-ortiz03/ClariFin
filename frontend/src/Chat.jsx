import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Send, MessageCircle } from 'lucide-react';
import { sessionToken } from './api';
import { MovementForm } from './components';
const examples = [
  'Me gasté 15 mil en transporte',
  'Compré un almuerzo de 20 lucas',
  'Me consignaron 200 mil del trabajo',
];
export function Chat({ data, save }) {
  const [text, set] = useState(''),
    [proposal, propose] = useState(null),
    [error, err] = useState(''),
    [busy, wait] = useState(false),
    [hearing, hear] = useState(false);
  const socket = useRef(),
    request = useRef(),
    mic = useRef(),
    timer = useRef();
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(() => {
    const s = io({ auth: { csrf: sessionToken() } });
    socket.current = s;
    function done(msg) {
      if (msg.requestId !== request.current) return;
      clearTimeout(timer.current);
      wait(false);
      if (msg.message) err(msg.message);
      else propose(msg);
    }
    s.on('chat:proposal', done);
    s.on('chat:error', done);
    s.on('connect', () => err(''));
    const failed = () => {
      wait(false);
      err('Chat desconectado. Puedes usar Registrar movimiento.');
    };
    s.on('connect_error', failed);
    s.on('disconnect', failed);
    return () => {
      s.off();
      s.disconnect();
      clearTimeout(timer.current);
      mic.current?.abort();
    };
  }, []);
  function send(e) {
    e.preventDefault();
    if (!socket.current.connected) {
      err('Chat sin conexión.');
      return;
    }
    err('');
    propose(null);
    wait(true);
    request.current = crypto.randomUUID();
    socket.current.emit('chat:interpret', { requestId: request.current, text });
    timer.current = setTimeout(() => {
      wait(false);
      err('No se recibió respuesta. Vuelve a intentarlo.');
    }, 8000);
  }
  function dictate() {
    if (hearing) {
      mic.current?.stop();
      return;
    }
    const rec = new Speech();
    mic.current = rec;
    rec.lang = 'es-CO';
    rec.interimResults = false;
    rec.onresult = (e) => set(e.results[0][0].transcript.slice(0, 240));
    rec.onend = () => hear(false);
    rec.onerror = () => {
      hear(false);
      err('No se pudo dictar. Puedes escribir tu movimiento.');
    };
    try {
      rec.start();
      hear(true);
      err('');
    } catch {
      err('El micrófono no está disponible.');
    }
  }
  return (
    <div className="chatlayout">
      <section className="panel">
        <div className="chatmark">
          <MessageCircle />
        </div>
        <h2>Escribe un ingreso o un gasto</h2>
        <p>
          Por ejemplo, «Me gasté 15 mil en transporte». Podrás revisar los datos
          antes de guardarlos.
        </p>
        <div className="suggest" aria-label="Ejemplos">
          {examples.map((x) => (
            <button type="button" key={x} onClick={() => set(x)}>
              {x}
            </button>
          ))}
        </div>
        <form onSubmit={send}>
          <label>
            Mensaje
            <textarea
              maxLength={240}
              required
              value={text}
              onChange={(e) => set(e.target.value)}
              placeholder="Describe tu movimiento…"
            />
          </label>
          <div className="actions">
            {Speech ? (
              <button type="button" className="secondary" onClick={dictate}>
                <Mic size={16} />
                {hearing ? 'Detener' : 'Dictar'}
              </button>
            ) : (
              <small>Dictado no disponible en este navegador.</small>
            )}
            <button disabled={busy}>
              <Send size={16} />
              {busy ? 'Interpretando…' : 'Interpretar'}
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {proposal && (
        <section className="panel">
          <h2>Revisa el movimiento</h2>
          <MovementForm
            key={proposal.requestId}
            data={data}
            initial={proposal}
            cancel={() => propose(null)}
            button="Confirmar movimiento"
            submit={async (b) => {
              await save('/transactions', 'POST', b);
              propose(null);
              set('');
            }}
          />
        </section>
      )}
    </div>
  );
}
