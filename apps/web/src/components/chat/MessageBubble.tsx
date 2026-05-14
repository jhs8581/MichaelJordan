import type { Message } from '@chat/types';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Props {
  message: Message;
  isMine: boolean;
  isConsecutive: boolean; // 같은 사람이 연속으로 보낸 메시지
}

export function MessageBubble({ message, isMine, isConsecutive }: Props) {
  const time = format(new Date(message.createdAt), 'a h:mm', { locale: ko });
  const readCount = message.reads?.length ?? 0;

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
            className="px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{
              background: isMine ? 'var(--bubble-mine)' : 'var(--bubble-other)',
              color: '#fff',
              borderRadius: isMine
                ? (isConsecutive ? '18px 4px 18px 18px' : '18px 4px 18px 18px')
                : (isConsecutive ? '4px 18px 18px 18px' : '4px 18px 18px 18px'),
            }}
          >
            {message.content}
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


