'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';

type RoomImageItem = { url: string; createdAt?: string };
type VideoItem = { url: string; createdAt?: string };
type LinkItem = { url: string; messageId: number; sender: { id: number; username: string } | null; createdAt: string };
type Tab = 'photos' | 'videos' | 'links';

interface Props {
  roomId: number;
  onClose: () => void;
  onImageClick?: (url: string, all: RoomImageItem[]) => void;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '') + '/api';

export function RoomInfoPanel({ roomId, onClose, onImageClick }: Props) {
  const [tab, setTab] = useState<Tab>('photos');

  // 최신 onClose 항상 참조 (deps 없이 effect 실행하기 위해)
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // 히스토리 관리는 ChatWindow(backInterceptorRef)에서 일괄 처리하므로 여기서 pushState 불필요

  const [images, setImages] = useState<RoomImageItem[] | null>(null);
  const [videos, setVideos] = useState<VideoItem[] | null>(null);
  const [links, setLinks] = useState<LinkItem[] | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const storeMessages = useChatStore(s => s.messages[roomId] ?? []);

  // 이미 로드된 메시지에서 즉시 URL 추출 (서버 재배포 여부 무관)
  const localLinks: LinkItem[] = useMemo(() => {
    const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
    const seen = new Set<string>();
    const result: LinkItem[] = [];
    for (let i = storeMessages.length - 1; i >= 0; i--) {
      const m = storeMessages[i];
      if (!m.content) continue;
      const urls = m.content.match(URL_REGEX) ?? [];
      for (const raw of urls) {
        const url = raw.replace(/[.,;:!?)+]+$/, '');
        if (!seen.has(url)) {
          seen.add(url);
          result.push({
            url,
            messageId: m.id,
            sender: m.sender ? { id: m.sender.id, username: m.sender.username } : null,
            createdAt: m.createdAt,
          });
        }
      }
    }
    return result;
  }, [storeMessages]);

  useEffect(() => {
    if (tab === 'photos' && images === null && !loadingImages) {
      setLoadingImages(true);
      api.get<{ data: { imageItems?: RoomImageItem[]; images?: string[] } }>(`/messages/${roomId}/images`)
        .then(res => {
          const items = res.data.data.imageItems ?? (res.data.data.images ?? []).map(url => ({ url }));
          setImages(items);
        })
        .catch(() => setImages([]))
        .finally(() => setLoadingImages(false));
    }
  }, [tab, roomId, images, loadingImages]);

  useEffect(() => {
    if (tab === 'videos' && videos === null && !loadingVideos) {
      setLoadingVideos(true);
      api.get<{ data: { videoItems: VideoItem[] } }>(`/messages/${roomId}/videos`)
        .then(res => setVideos(res.data.data.videoItems))
        .catch(() => setVideos([]))
        .finally(() => setLoadingVideos(false));
    }
  }, [tab, roomId, videos, loadingVideos]);

  useEffect(() => {
    if (tab === 'links' && links === null && !loadingLinks) {
      setLoadingLinks(true);
      api.get<{ data: { links: LinkItem[] } }>(`/messages/${roomId}/links`)
        .then(res => setLinks(res.data.data.links))
        .catch(() => setLinks(localLinks))  // 서버 실패 시 로컬 추출 결과 사용
        .finally(() => setLoadingLinks(false));
    }
  }, [tab, roomId, links, loadingLinks, localLinks]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 25, display: 'flex', flexDirection: 'column', background: 'var(--chat-bg)' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid #1e1f22' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }}
          aria-label="뒤로"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>채팅방 정보</span>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #1e1f22' }}>
        {(['photos', 'videos', 'links'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 0', fontWeight: 600, fontSize: 13,
              border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer', background: 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {t === 'photos' ? '📷 사진' : t === 'videos' ? '🎬 동영상' : '🔗 링크'}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tab === 'photos' && (
          loadingImages
            ? <EmptyState text="불러오는 중..." />
            : !images?.length
              ? <EmptyState text="사진이 없습니다" />
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: 2 }}>
                  {images.map((item, i) => (
                    <div
                      key={i}
                      style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'zoom-in' }}
                      onClick={() => onImageClick?.(item.url, images)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ))}
                </div>
              )
        )}

        {tab === 'videos' && (
          loadingVideos
            ? <EmptyState text="불러오는 중..." />
            : !videos?.length
              ? <EmptyState text="동영상이 없습니다" />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
                  {videos.map((item, i) => (
                    <div key={i} style={{ borderRadius: 12, overflow: 'hidden', background: '#0f1115' }}>
                      <video
                        src={item.url}
                        controls
                        playsInline
                        preload="metadata"
                        style={{ width: '100%', maxHeight: 280, display: 'block', borderRadius: 12 }}
                      />
                      {item.createdAt && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 6px', margin: 0 }}>
                          {new Date(item.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )
        )}

        {tab === 'links' && (() => {
          // 서버 응답 전이면 로컬 추출 결과를 미리 보여줌
          const displayLinks = links !== null ? links : localLinks;
          if (loadingLinks && localLinks.length === 0) {
            return <EmptyState text="불러오는 중..." />;
          }
          if (displayLinks.length === 0) {
            return <EmptyState text="링크가 없습니다" />;
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
              {displayLinks.map((link, i) => <LinkRow key={link.url + i} link={link} />)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 48, fontSize: 13 }}>{text}</p>
  );
}

type LinkPreviewCached = { title?: string } | null;
const linkCache = new Map<string, LinkPreviewCached>();

function LinkRow({ link }: { link: LinkItem }) {
  const token = useAuthStore((s) => s.accessToken);
  const hostname = (() => { try { return new URL(link.url).hostname.replace(/^www\./, ''); } catch { return link.url; } })();
  const [preview, setPreview] = useState<{ title: string } | null | undefined>(
    linkCache.has(link.url) ? (linkCache.get(link.url) ? { title: linkCache.get(link.url)!.title ?? link.url } : null) : undefined
  );

  useEffect(() => {
    if (linkCache.has(link.url)) {
      const c = linkCache.get(link.url);
      setPreview(c ? { title: c.title ?? link.url } : null);
      return;
    }
    fetch(`${API_BASE}/messages/link-preview?url=${encodeURIComponent(link.url)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json() as Promise<{ success: boolean; data?: { title: string } }>)
      .then(res => {
        const data = res.success && res.data ? { title: res.data.title } : null;
        linkCache.set(link.url, data);
        setPreview(data);
      })
      .catch(() => { linkCache.set(link.url, null); setPreview(null); });
  }, [link.url, token]);

  const dateStr = new Date(link.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block', padding: '10px 12px', borderRadius: 10,
        background: 'var(--bubble-other)', textDecoration: 'none',
        color: 'var(--text-primary)', borderLeft: '3px solid var(--accent)',
      }}
    >
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
        {hostname} · {dateStr}{link.sender ? ` · ${link.sender.username}` : ''}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere', color: '#00aff4' }}>
        {preview?.title ?? link.url}
      </p>
    </a>
  );
}
