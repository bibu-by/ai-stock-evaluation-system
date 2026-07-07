// Markdown 渲染组件 - 用于 AI / Agent 回复
// 支持 GFM（表格、任务列表、删除线）+ 基础排版
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: Props) {
  return (
    <div
      className={cn(
        "prose-chat space-y-2 text-sm leading-relaxed",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2 mb-1 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 mb-1 text-sm font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-1 mb-1 text-sm font-medium">{children}</h3>
          ),
          p: ({ children }) => <p className="m-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="m-0 list-disc pl-5 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="m-0 list-decimal pl-5 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="m-0">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border" />,
          code: ({ className, children, ...props }) => {
            // react-markdown v9 已移除 inline prop；通过 className 是否含 language- 区分
            // 带语言标识的 code（在 <pre> 内）由 pre 提供块样式，这里只处理 inline code
            const isBlock = /language-/.test(className || "");
            if (isBlock) {
              return (
                <code className={cn("font-mono text-[12px]", className)} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-secondary px-1 py-0.5 font-mono text-[12px]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-md border border-border bg-secondary/60 p-2">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-secondary/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">
              {children}
            </td>
          ),
        } satisfies Components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
