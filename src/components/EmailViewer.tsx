import React from "react";
import DOMPurify from "dompurify";
import { formatEmailAddress } from "../utils/formatEmailAddress";

type EmailViewerProps = {
  subject: string;
  from: string;
  to: string;
  date: string;
  htmlBody: string;
  threadId?: string;
  containerClassName?: string;
  //expended?: boolean;
  replyFromParent?: string;
  OnHandleReply?: () => void;
};

function removeExecutableEmailContent(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content
    .querySelectorAll("script, iframe, object, embed")
    .forEach((node) => node.remove());

  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return template.innerHTML;
}

const EmailViewer: React.FC<EmailViewerProps> = ({
  subject,
  from,
  to,
  date,
  htmlBody,
  containerClassName = "bg-white border border-gray-300 p-4 max-w-5xl mx-auto mb-4",
  //expended,
}) => {
  const [iframeHeight, setIframeHeight] = React.useState(600);
  const emailDocument = React.useMemo(() => {
    const executableContentRemoved = removeExecutableEmailContent(htmlBody || "");
    const sanitizedHtml = DOMPurify.sanitize(executableContentRemoved, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed"],
    });

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.5;
      }
      body {
        padding: 0;
        overflow-wrap: anywhere;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100%;
      }
    </style>
  </head>
  <body>${sanitizedHtml}</body>
</html>`;
  }, [htmlBody]);
  //const [isExpanded, setIsExpanded] = useState(expended);

  //const toggleExpand = () => setIsExpanded(prev => !prev);

  const handleIframeLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = event.currentTarget.contentDocument;
      const nextHeight = Math.max(
        240,
        doc?.documentElement.scrollHeight || doc?.body.scrollHeight || 600
      );
      setIframeHeight(Math.min(nextHeight, 4000));
    } catch {
      setIframeHeight(600);
    }
  };

  return (
    <div className={containerClassName}>
      <header className="flex justify-between items-start mb-4 border-b border-gray-400 pb-4">
        <div>
          <h2 className="text-xl font-bold mb-2">{subject}</h2>
          <div className="flex gap-3 text-sm text-gray-600">
            <div>
              <span className="font-semibold">From:</span>{" "}
              {formatEmailAddress(from)}
            </div>
            <div>
              <span className="font-semibold">To:</span>{" "}
              {formatEmailAddress(to)}
            </div>
            <div>
              <span className="font-semibold">Date:</span>{" "}
              {new Date(date).toLocaleString()}
            </div>
          </div>
        </div>
      </header>

      <section className="max-w-none">
        <iframe
          title={`Email body: ${subject}`}
          className="w-full border-0 bg-white"
          srcDoc={emailDocument}
          referrerPolicy="no-referrer"
          style={{ height: iframeHeight }}
          onLoad={handleIframeLoad}
        />
      </section>
    </div>
  );
};

export default EmailViewer;
