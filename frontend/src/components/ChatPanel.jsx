import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../lib/socket.js';

export default function ChatPanel({ requestId, role, userName, lang }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;

    socket.emit('join_chat', { request_id: requestId, role, name: userName });

    const handleMessage = (msg) => {
      if (msg.request_id === requestId) {
        setMessages((prev) => [...prev, msg].slice(-100));
      }
    };

    socket.on('receive_message', handleMessage);
    return () => socket.off('receive_message', handleMessage);
  }, [requestId, role, userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !requestId) return;

    const msg = {
      request_id: requestId,
      from: userName,
      role,
      text: inputText.trim(),
      ts: new Date().toISOString(),
      id: `local-${Date.now()}`
    };
    
    // Add message to local state immediately for instant feedback
    setMessages((prev) => [...prev, msg].slice(-100));
    socket.emit('send_message', msg);
    setInputText('');
  };

  if (!requestId) return null;

  const t = {
    en: { chat: 'Chat', send: 'Send', typeMessage: 'Type a message...', openChat: '💬 Chat with Driver' },
    es: { chat: 'Chat', send: 'Enviar', typeMessage: 'Escribe un mensaje...', openChat: '💬 Chatear con conductor' }
  }[lang] || { chat: 'Chat', send: 'Send', typeMessage: 'Type a message...', openChat: '💬 Chat' };

  if (messages.length === 0 && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 font-semibold transition-all hover:scale-105 active:scale-95"
      >
        <span>💬</span>
        <span className="hidden sm:inline">{t.openChat}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-80 max-w-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl h-[400px] sm:h-96 flex flex-col">
        <div className="bg-indigo-600 text-white px-4 py-3 rounded-t-xl flex justify-between items-center">
          <span className="font-semibold">{t.chat}</span>
          <button 
            onClick={() => setIsOpen(false)} 
            className="text-white hover:text-slate-200 hover:bg-indigo-700 rounded-full w-7 h-7 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scroll-smooth">
          {messages.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id || `msg-${msg.ts}-${msg.from}`}
                className={`flex ${msg.role === role ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === role
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-800 text-slate-100 rounded-bl-none'
                  }`}
                >
                  {msg.role !== role && (
                    <div className="text-xs opacity-75 mb-1 font-medium">{msg.from}</div>
                  )}
                  <div className="break-words">{msg.text}</div>
                  <div className={`text-xs opacity-60 mt-1 ${msg.role === role ? 'text-right' : ''}`}>
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="border-t border-slate-800 p-3 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.typeMessage}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus={isOpen}
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold text-sm transition transition-colors"
          >
            {t.send}
          </button>
        </form>
      </div>
    </div>
  );
}
