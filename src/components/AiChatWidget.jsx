import React, { useState, useRef, useEffect } from 'react';
import { MessageCircleQuestion, Send, Trash2, Loader2, Bot, User, X } from 'lucide-react';
import * as api from '../services/api';
import { useToast } from './ToastProvider';

// Floating widget, not a sidebar tab — reachable from anywhere in the app,
// same as a real chat-support bubble. Separate from the order-parsing AI
// Agent on purpose (see the 2026-08-24 audit follow-up): grounded Q&A over
// data this app already holds (khách hàng, doanh thu, sản phẩm, kế hoạch),
// backed by Gemini function-calling (gas/AiChat.gs). Does NOT cover công nợ
// (Debt) — that tab isn't read by this app at all.
const SUGGESTIONS = [
  'Tìm khách hàng Tecom',
  'Doanh thu khách Tecom tháng này',
  'Tổng quan kế hoạch kinh doanh hiện tại'
];

export default function AiChatWidget({ token }) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role:'user'|'model', text}] — display-only
  const [geminiHistory, setGeminiHistory] = useState([]); // raw {role,parts} turns resent to gas/AiChat.gs
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending, isOpen]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || isSending) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setIsSending(true);
    try {
      const result = await api.aiChat(token, q, geminiHistory);
      setMessages(m => [...m, { role: 'model', text: result.reply }]);
      setGeminiHistory(result.history || []);
    } catch (err) {
      toast.error('Không hỏi được: ' + err.message);
      setMessages(m => m.slice(0, -1)); // drop the optimistic user bubble that never got an answer
      setInput(q);
    } finally {
      setIsSending(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setGeminiHistory([]);
  };

  return (
    <>
      {/* Trigger — always visible regardless of which tab is open. Swap the
          icon below for an <img src="/ai-mascot.png"> once a real mascot
          asset file is available; Bot is a stand-in. */}
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Đóng Tra cứu AI' : 'Mở Tra cứu AI'}
        title="Tra cứu AI"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          width: '58px',
          height: '58px',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
          boxShadow: '0 8px 24px rgba(37, 99, 235, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {isOpen ? <X size={26} color="#fff" /> : <Bot size={28} color="#fff" />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Tra cứu AI"
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '24px',
            zIndex: 999,
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            height: '560px',
            maxHeight: 'calc(100vh - 140px)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}
          className="animate-fade-in"
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircleQuestion size={18} color="var(--karofi-cyan)" />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>Tra cứu AI</strong>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {messages.length > 0 && (
                <button onClick={handleClear} className="btn btn-secondary btn-sm" title="Xoá hội thoại">
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" title="Đóng">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Thread */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', padding: '14px' }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', textAlign: 'center', padding: '20px 8px', color: 'var(--text-dim)' }}>
                <MessageCircleQuestion size={28} color="var(--karofi-cyan)" />
                <span style={{ fontSize: '0.8rem' }}>Hỏi về khách hàng, doanh thu, sản phẩm, hoặc kế hoạch — chưa hỗ trợ công nợ.</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: m.role === 'user' ? 'var(--karofi-cyan-light)' : 'var(--bg-input)'
                }}>
                  {m.role === 'user' ? <User size={13} color="var(--karofi-cyan)" /> : <Bot size={13} color="var(--accent-emerald)" />}
                </div>
                <div style={{
                  maxWidth: '78%', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.825rem', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--karofi-cyan-light)' : 'var(--bg-input)',
                  color: 'var(--text-main)'
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {isSending && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Loader2 size={14} className="animate-spin" /> Đang tra cứu...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', padding: '10px', flexShrink: 0 }}
          >
            <input
              type="text"
              className="input-field"
              placeholder="Hỏi điều gì đó..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
              style={{ fontSize: '0.85rem' }}
            />
            <button type="submit" disabled={isSending || !input.trim()} className="btn btn-primary">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
