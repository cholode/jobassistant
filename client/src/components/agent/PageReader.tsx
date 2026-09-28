import { FileText, Loader2 } from 'lucide-react';
import type { PageState } from '../../../shared/protocol';
import { usePageReader } from '../../hooks/usePageReader';

const kinds = { job_list: '职位列表', job_detail: '职位详情', chat: '聊天消息', unknown: '网页正文', verification: '需要人工验证' };
export function PageReader({ page, connected }: { page?: PageState; connected: boolean }) {
  const { reading, busy, error, read } = usePageReader(page, connected);
  return <section className="page-reader" aria-label="页面读取">
    <div className="section-caption">页面内容 <FileText size={14}/></div>
    <button className="test-button" disabled={!connected || busy || page?.loading} onClick={() => void read()}>
      {busy ? <Loader2 size={14} className="spin"/> : <FileText size={14}/>} {busy ? '正在读取…' : '读取当前页面'}
    </button>
    <p className="reader-hint">读取当前页面已加载的内容；暂停时也可手动读取。</p>
    {error && <p className="reader-error" role="alert">{error}</p>}
    {reading && <div className="reading-result" data-testid="page-reading" aria-live="polite">
      <strong>{kinds[reading.kind]}</strong><small>{reading.platform === 'mock' ? '模拟招聘站' : '通用读取'} · {new Date(reading.read_at).toLocaleTimeString('zh-CN', { hour12: false })}</small>
      <p className="reader-hint">{reading.notice}</p>
      {reading.jobs.map(job => <article className="read-job" key={job.id}>
        <strong>{job.title}</strong><p>{job.company}</p><p>{job.salary} · {job.location}</p>
        {!!job.tags.length && <p>{job.tags.join(' / ')}</p>}
        {job.description && <details><summary>职位正文</summary><p className="read-text">{job.description}</p></details>}
      </article>)}
      {reading.kind === 'job_list' && !reading.jobs.length && <p>当前列表没有职位。</p>}
      {reading.messages.map((message, index) => <div className="read-message" key={index}><b>{message.sender === 'me' ? '我' : message.sender === 'hr' ? 'HR' : '未知发送者'}</b><p>{message.text}</p></div>)}
      {reading.kind === 'chat' && !reading.messages.length && <p>当前没有已加载的消息。</p>}
      <details><summary>查看页面正文{reading.truncated ? '（已截断）' : ''}</summary><p className="read-text">{reading.text || '页面暂无正文'}</p></details>
    </div>}
  </section>;
}
