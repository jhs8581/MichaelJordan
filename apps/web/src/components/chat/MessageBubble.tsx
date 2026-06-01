import { useEffect, useRef, useState } from 'react';
import type { Message } from '@chat/types';
import { useAuthStore } from '@/store/auth';

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const URL_TEST = /^https?:\/\//;

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '') + '/api';

type LinkPreviewData = { title: string; description?: string; url: string };
const linkPreviewCache = new Map<string, LinkPreviewData | null>();

function extractFirstUrl(content: string): string | null {
  URL_REGEX.lastIndex = 0;
  const match = URL_REGEX.exec(content);
  URL_REGEX.lastIndex = 0;
  return match ? match[1] : null;
}

function LinkPreviewCard({ url, isMine }: { url: string; isMine: boolean }) {
  const token = useAuthStore((s) => s.accessToken);
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(
    linkPreviewCache.has(url) ? linkPreviewCache.get(url) : undefined
  );

  useEffect(() => {
    if (linkPreviewCache.has(url)) {
      setPreview(linkPreviewCache.get(url) ?? null);
      return;
    }
    fetch(`${API_BASE}/messages/link-preview?url=${encodeURIComponent(url)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json() as Promise<{ success: boolean; data?: LinkPreviewData }>)
      .then((res) => {
        const data = res.success && res.data ? res.data : null;
        linkPreviewCache.set(url, data);
        setPreview(data);
      })
      .catch(() => { linkPreviewCache.set(url, null); setPreview(null); });
  }, [url, token]);

  if (!preview) return null;

  const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        display: 'block',
        marginTop: 6,
        borderRadius: 8,
        padding: '7px 10px',
        background: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)',
        borderLeft: '3px solid rgba(255,255,255,0.45)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <p style={{ fontSize: 10, opacity: 0.65, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostname}</p>
      <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{preview.title}</p>
      {preview.description && (
        <p style={{ fontSize: 11, opacity: 0.75, marginTop: 2, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview.description}
        </p>
      )}
    </a>
  );
}

export function renderMessageContent(content: string): React.ReactNode {
  const parts = content.split(URL_REGEX);
  if (parts.length === 1) return content;

  return parts.map((part, i) =>
    URL_TEST.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: '#00aff4', textDecoration: 'underline', wordBreak: 'break-all' }}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface Props {
  message: Message;
  isMine: boolean;
  isConsecutive: boolean; // 같은 사람이 연속으로 보난 메시지
  timeFormat: 'ampm' | '24h';
  showNickname?: boolean;
  naverTheme?: boolean;
  naverDark?: boolean;
  onImageClick?: (url: string) => void;
  onLongPress?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onJumpToMessage?: (messageId: number) => void;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(url);
}

function getValidTimeZone(timeZone?: string): string | undefined {
  if (!timeZone?.trim()) return undefined;
  try {
    Intl.DateTimeFormat('ko-KR', { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

export function MessageBubble({ message, isMine, isConsecutive, timeFormat, showNickname = true, naverTheme, naverDark, onImageClick, onLongPress, onReply, onJumpToMessage }: Props) {
  const time = formatMessageTime(new Date(message.createdAt), timeFormat, message.senderTimeZone, message.senderLocalTime);
  // 보낸 사람 본인을 제외한 읽음 수 (본인 읽음은 항상 있어서 무조건 읽음으로 표시되는 버그 방지)
  const readCount = (message.reads ?? []).filter((r) => r.userId !== message.senderId).length;
  const firstUrl = !message.fileUrl ? extractFirstUrl(message.content ?? '') : null;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);

  function startPress(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressedRef.current = false;
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress?.(message);
    }, 500);
  }
  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  function handleTouchMove(e: React.TouchEvent) {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    if (Math.abs(touch.clientX - start.x) > 8 || Math.abs(touch.clientY - start.y) > 8) cancelPress();
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    cancelPress();
    touchStartRef.current = null;
    if (!start || !touch || longPressedRef.current) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) >= 55 && Math.abs(dy) <= 40) {
      e.preventDefault();
      e.stopPropagation();
      onReply?.(message);
    }
  }

  return (
    <div className={`flex gap-3 ${isConsecutive ? 'mt-0.5' : 'mt-4'} ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 아바타 */}
      {!isMine && (
        <div className="flex-shrink-0 w-9 h-9">
          {!isConsecutive ? (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: stringToColor(message.sender?.username ?? '?'), color: '#fff' }}
            >
              {(message.sender?.username ?? '?')[0].toUpperCase()}
            </div>
          ) : (
            <div className="w-9 h-9" /> // 연속 메시지는 아바타 자리만 유지
          )}
        </div>
      )}

      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[82%] sm:max-w-[70%] min-w-0`}>
        {/* 이름 + 시간 (상대 첫 메시지만) */}
        {!isMine && !isConsecutive && showNickname && (
          <div className="flex items-baseline gap-2 mb-1 flex-row">
            <span className="text-sm font-semibold" style={{ color: stringToColor(message.sender?.username ?? '?') }}>
              {message.sender?.username}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{time}</span>
          </div>
        )}

        {/* 말풍선 */}
        <div className="flex items-end gap-1.5">
          {/* 읽음/시간 (내 메시지 왼쪽) */}
          {isMine && (
            <div
              className="flex flex-col items-end justify-end gap-0.5 mb-0.5"
              style={{ width: 58, minWidth: 58, flexShrink: 0, whiteSpace: 'nowrap', lineHeight: 1.15 }}
            >
              <span className="text-[10px]" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{time}</span>
              {readCount > 0 && (
                <span className="read-label text-[10px] font-medium" style={{ color: '#57f287', whiteSpace: 'nowrap' }}>읽음</span>
              )}
            </div>
          )}

          <div
            className="px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0"
            style={{
              overflowWrap: 'anywhere',
              background: isMine ? 'var(--bubble-mine)' : 'var(--bubble-other)',
              color: isMine ? '#fff' : 'var(--text-primary)',
              borderRadius: isMine
                ? (isConsecutive ? '18px 4px 18px 18px' : '18px 4px 18px 18px')
                : (isConsecutive ? '4px 18px 18px 18px' : '4px 18px 18px 18px'),
              padding: message.fileUrl ? '4px' : undefined,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onLongPress?.(message); }}
            onTouchStart={startPress}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={cancelPress}
            onTouchMove={handleTouchMove}
          >
            {message.replyTo && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => { if (message.replyTo?.id) onJumpToMessage?.(message.replyTo.id); }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && message.replyTo?.id) {
                    e.preventDefault();
                    onJumpToMessage?.(message.replyTo.id);
                  }
                }}
                className="mb-2 rounded-xl px-2.5 py-2 text-left"
                style={{
                  width: 'min(260px, 100%)',
                  background: (!isMine && naverTheme && !naverDark)
                    ? 'rgba(0,0,0,0.07)'
                    : (isMine ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.10)'),
                  border: 'none',
                  borderLeft: (!isMine && naverTheme && !naverDark)
                    ? '3px solid rgba(0,0,0,0.25)'
                    : '3px solid rgba(255,255,255,0.72)',
                  cursor: 'pointer',
                  display: 'block',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  boxShadow: (!isMine && naverTheme && !naverDark)
                    ? 'inset 0 0 0 1px rgba(0,0,0,0.06)'
                    : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                }}
                title="원본 메시지로 이동"
                aria-label={`답장 대상: ${message.replyTo.sender?.username ?? `사용자${message.replyTo.senderId}`} — 원본 메시지로 이동`}
              >
                <p className="text-[11px] font-bold leading-tight truncate" style={{ color: (!isMine && naverTheme && !naverDark) ? '#333' : '#fff', marginBottom: 4 }}>
                  {message.replyTo.sender?.username ?? `사용자${message.replyTo.senderId}`}에게 답장
                </p>
                <p className="text-[11px] leading-tight truncate" style={{ color: (!isMine && naverTheme && !naverDark) ? '#666' : 'rgba(255,255,255,0.78)', maxWidth: '100%' }}>
                  {message.replyTo.fileUrl ? '[사진]' : (message.replyTo.content || '[메시지]')}
                </p>
              </div>
            )}

            {message.fileUrl ? (
              isVideoUrl(message.fileUrl) ? (
                <video
                  src={message.fileUrl}
                  controls
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 220, borderRadius: 14, display: 'block' }}
                />
              ) : (
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.fileUrl}
                    alt="이미지"
                    onClick={() => onImageClick?.(message.fileUrl!)}
                    style={{ maxWidth: 220, maxHeight: 260, borderRadius: 14, display: 'block', objectFit: 'cover', cursor: onImageClick ? 'zoom-in' : 'default' }}
                  />
                  <a
                    href={message.fileUrl}
                    download
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: 6, right: 6,
                      background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '3px 6px',
                      color: '#fff', fontSize: 11, textDecoration: 'none', lineHeight: 1,
                    }}
                    title="다운로드"
                  >
                    ↓
                  </a>
                </div>
              )
            ) : <>
                {renderMessageContent(message.content ?? '')}
                {firstUrl && <LinkPreviewCard url={firstUrl} isMine={isMine} />}
              </>}
          </div>

          {/* 읽음/시간 (상대 메시지 오른쪽) */}
          {!isMine && isConsecutive && (
            <span
              className="text-[10px] mb-0.5"
              style={{ color: 'var(--text-muted)', width: 58, minWidth: 58, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {time}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 사용자 이름을 색상으로 변환 (항상 같은 색)
function stringToColor(str: string): string {
  const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55d', '#faa61a', '#00aff4'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatMessageTime(date: Date, mode: 'ampm' | '24h', timeZone?: string, senderLocalTime?: string): string {
  if (senderLocalTime && /^\d{2}:\d{2}$/.test(senderLocalTime)) {
    if (mode === '24h') return senderLocalTime;
    const [hourText, minuteText] = senderLocalTime.split(':');
    const hour = Number(hourText);
    const period = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 || 12;
    return `${period} ${displayHour}:${minuteText}`;
  }

  const validTimeZone = getValidTimeZone(timeZone);
  try {
    if (mode === '24h') {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: validTimeZone });
    }

    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: validTimeZone });
  } catch {
    return mode === '24h'
      ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}
