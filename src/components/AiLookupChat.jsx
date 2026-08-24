import React, { useState, useRef, useEffect } from 'react';
import { MessageCircleQuestion, Send, Trash2, Loader2, Bot, User } from 'lucide-react';
import * as api from '../services/api';
import { useToast } from './ToastProvider';

// Separate from the order-parsing AI Agent on purpose (see the 2026-08-24
// audit follow-up) — this is grounded Q&A over data already loaded in this
// app (khách hàng, doanh thu, sản phẩm, kế hoạch), backed by Gemini function-
// calling (gas/AiChat.gs), not order entry. Does NOT cover công nợ (Debt) —
// that tab isn't read by this app at all.
const SUGGESTIONS = [
  'Tìm khách hàng Tecom',
  'Doanh thu khách Tecom tháng này',
  'Tra cứu giá và tồn kế hoạch của 1 mã SKU',
  'Tổng quan kế hoạch kinh doanh hiện tại'
];

export default function AiLookupChat({ token }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]); // [{role:'user'|'model', text}] — display-only
  const [geminiHistory, setGeminiHistory] = useState([]); // raw {role,parts} turns resent to gas/AiChat.gs
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageCircleQuestion size={24} color="var(--karofi-cyan)" /> Tra cứu AI
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Hỏi về khách hàng, doanh thu, sản phẩm, hoặc kế hoạch kinh doanh — chưa hỗ trợ tra cứu công nợ.
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="btn btn-secondary btn-sm">
            <Trash2 size={14} /> Xoá hội thoại
          </button>
        )}
      </div>

      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '480px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '55vh', padding: '4px' }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', textAlign: 'center', padding: '32px 16px', color: 'var(--text-dim)' }}>
              <MessageCircleQuestion size={32} color="var(--karofi-cyan)" />
              <span style={{ fontSize: '0.85rem' }}>Thử hỏi một câu, hoặc chọn gợi ý bên dưới:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} className="btn btn-secondary btn-sm">{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: m.role === 'user' ? 'var(--karofi-cyan-light)' : 'var(--bg-input)'
              }}>
                {m.role === 'user' ? <User size={15} color="var(--karofi-cyan)" /> : <Bot size={15} color="var(--accent-emerald)" />}
              </div>
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--karofi-cyan-light)' : 'var(--bg-input)',
                color: 'var(--text-main)'
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {isSending && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
              <Loader2 size={16} className="animate-spin" /> Đang tra cứu...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}
        >
          <input
            type="text"
            className="input-field"
            placeholder="Hỏi về khách hàng, doanh thu, sản phẩm, kế hoạch..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
          />
          <button type="submit" disabled={isSending || !input.trim()} className="btn btn-primary">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
