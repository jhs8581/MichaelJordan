import { useRef } from 'react';
import type { Message } from '@chat/types';

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const URL_TEST = /^https?:\/\//;

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
  onImageClick?: (url: string) => void;
  onLongPress?: (message: Message) => void;
  onJumpToMessage?: (messageId: number) => void;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(url);
}

export function MessageBubble({ message, isMine, isConsecutive, timeFormat, onImageClick, onLongPress, onJumpToMessage }: Props) {
  const time = formatMessageTime(new Date(message.createdAt), timeFormat);
  // 보낸 사람 본인을 제외한 읽음 수 (본인 읽음은 항상 있어서 무조건 읽음으로 표시되는 버그 방지)
  const readCount = (message.reads ?? []).filter((r) => r.userId !== message.senderId).length;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startPress() {
    pressTimer.current = setTimeout(() => { onLongPress?.(message); }, 500);
  }
  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
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

      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[70%]`}>
        {/* 이름 + 시간 (첫 메시지만) */}
        {!isConsecutive && (
          <div className={`flex items-baseline gap-2 mb-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            {!isMine && (
              <span className="text-sm font-semibold" style={{ color: stringToColor(message.sender?.username ?? '?') }}>
                {message.sender?.username}
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{time}</span>
          </div>
        )}

        {/* 말풍선 */}
        <div className="flex items-end gap-1.5">
          {/* 읽음/시간 (내 메시지 왼쪽) */}
          {isMine && (
            <div className="flex flex-col items-end gap-0.5 mb-0.5">
              {isConsecutive && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{time}</span>}
              {readCount > 0 && (
                <span className="text-[10px] font-medium" style={{ color: '#57f287' }}>읽음</span>
              )}
            </div>
          )}

          <div
            className="px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words select-text"
            style={{
              background: isMine ? 'var(--bubble-mine)' : 'var(--bubble-other)',
              color: '#fff',
              borderRadius: isMine
                ? (isConsecutive ? '18px 4px 18px 18px' : '18px 4px 18px 18px')
                : (isConsecutive ? '4px 18px 18px 18px' : '4px 18px 18px 18px'),
              padding: message.fileUrl ? '4px' : undefined,
            }}
            onContextMenu={(e) => { e.preventDefault(); onLongPress?.(message); }}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
          >
            {message.replyTo && (
              <button
                type="button"
                onClick={() => onJumpToMessage?.(message.replyTo!.id)}
                className="mb-1.5 w-full rounded-lg px-2 py-1 text-left"
                style={{ background: 'rgba(0,0,0,0.28)', color: '#d9dce4' }}
                title="원본 메시지로 이동"
              >
                <p className="text-[11px] font-semibold leading-tight">
                  {message.replyTo.sender?.username ?? `사용자${message.replyTo.senderId}`}
                </p>
                <p className="text-[11px] leading-tight truncate">
                  {message.replyTo.fileUrl ? '[파일]' : (message.replyTo.content || '[메시지]')}
                </p>
              </button>
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
            ) : renderMessageContent(message.content ?? '')}
          </div>

          {/* 읽음/시간 (상대 메시지 오른쪽) */}
          {!isMine && isConsecutive && (
            <span className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{time}</span>
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

function formatMessageTime(date: Date, mode: 'ampm' | '24h'): string {
  if (mode === '24h') {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
}

