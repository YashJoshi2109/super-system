import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../lib/socket.js';

export default function ChatPanel({ requestId, role, userName, lang }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;

    // Join chat room when component mounts or requestId changes
    socket.emit('join_chat', { request_id: requestId, role, name: userName });

    const handleMessage = (msg) => {
      if (msg.request_id === requestId) {
        setMessages((prev) => [...prev, msg].slice(-100));
        // Increment unread count if chat is closed or if message is from other role
        if (!isOpen && msg.role !== role) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    };

    const handleUserJoined = (data) => {
      // Optionally show when another user joins
      if (data.request_id === requestId && data.role !== role) {
        console.log(`${data.name} joined the chat`);
      }
    };

    socket.on('receive_message', handleMessage);
    socket.on('user_joined', handleUserJoined);
    
    return () => {
      socket.off('receive_message', handleMessage);
      socket.off('user_joined', handleUserJoined);
    };
  }, [requestId, role, userName, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset unread count when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

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
    en: { 
      chat: 'Chat with Driver', 
      send: 'Send', 
      typeMessage: 'Type a message...', 
      openChat: '💬 Chat',
      noMessages: 'No messages yet. Start the conversation!',
      driverChat: 'Chat with Guest'
    },
    es: { 
      chat: 'Chatear con conductor', 
      send: 'Enviar', 
      typeMessage: 'Escribe un mensaje...', 
      openChat: '💬 Chat',
      noMessages: 'Aún no hay mensajes. ¡Comienza la conversación!',
      driverChat: 'Chatear con huésped'
    }
  }[lang] || { 
    chat: 'Chat with Driver', 
    send: 'Send', 
    typeMessage: 'Type a message...', 
    openChat: '💬 Chat',
    noMessages: 'No messages yet. Start the conversation!',
    driverChat: 'Chat with Guest'
  };

  // Show floating button when chat is closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-5 py-4 rounded-full shadow-2xl flex items-center gap-2 font-semibold text-base transition-all hover:scale-105 active:scale-95 min-h-[56px] touch-manipulation"
        aria-label="Open chat"
      >
        <span className="text-2xl">💬</span>
        <span className="hidden sm:inline">{role === 'driver' ? t.driverChat : t.openChat}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[calc(100vw-2rem)] sm:w-96 max-w-md">
      <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl shadow-2xl h-[500px] sm:h-[550px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 rounded-t-2xl flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <div>
              <div className="font-semibold text-sm sm:text-base">{role === 'driver' ? t.driverChat : t.chat}</div>
              {role === 'guest' && (
                <div className="text-xs opacity-90">Real-time messaging</div>
              )}
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)} 
            className="text-white hover:text-slate-200 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-all active:scale-90 touch-manipulation"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth bg-slate-950/50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-slate-400 text-sm mb-1 font-medium">{t.noMessages}</div>
              <div className="text-slate-500 text-xs">Your messages will appear here</div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id || `msg-${msg.ts}-${msg.from}`}
                className={`flex ${msg.role === role ? 'justify-end' : 'justify-start'} animate-slide-in`}
              >
                <div
                  className={`max-w-[80%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 shadow-lg ${
                    msg.role === role
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-md'
                      : 'bg-slate-800 text-slate-100 rounded-bl-md border border-slate-700'
                  }`}
                >
                  {msg.role !== role && (
                    <div className="text-xs opacity-80 mb-1 font-semibold">{msg.from}</div>
                  )}
                  <div className="break-words text-sm sm:text-base leading-relaxed">{msg.text}</div>
                  <div className={`text-xs opacity-70 mt-1.5 ${msg.role === role ? 'text-right' : ''}`}>
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={sendMessage} className="border-t border-slate-800 p-3 bg-slate-900 flex-shrink-0 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.typeMessage}
            className="flex-1 bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm sm:text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-500"
            autoFocus={isOpen}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-semibold text-sm sm:text-base transition-all active:scale-95 touch-manipulation min-w-[80px]"
          >
            {t.send}
          </button>
        </form>
      </div>
    </div>
  );
}
