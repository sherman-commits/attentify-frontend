import React from "react";

type SMSViewerProps = {
  from: string;
  to: string;
  date: string;
  body: string;
  isExpanded?: boolean;
  containerClassName?: string;
};

const SMSViewer: React.FC<SMSViewerProps> = ({
  from,
  to,
  date,
  body,
  isExpanded,
  containerClassName = "bg-white shadow-md p-6 max-w-5xl mx-auto"
}) => {

  return (
    <div>
      {!isExpanded && (
        <div className={containerClassName}>
          <header>
            <h2 className="text-xl font-bold mb-2">SMS</h2>
            <div className="flex gap-3 text-sm text-gray-600">
              <div>
                <span className="font-semibold">From:</span>{" "}
                {from}
              </div>
              <div>
                <span className="font-semibold">To:</span>{" "}
                {to}
              </div>
              <div>
                <span className="font-semibold">Date:</span>  {new Date(date).toLocaleString()}
              </div>
            </div>
          </header>
        </div>
      )}
      {isExpanded && (
        <div className={containerClassName}>
          <header className="mb-4 border-b pb-4">
            <h2 className="text-xl font-bold mb-2">SMS</h2>
            <div className="flex gap-3 text-sm text-gray-600">
              <div>
                <span className="font-semibold">From:</span>{" "}
                {from}
              </div>
              <div>
                <span className="font-semibold">To:</span>{" "}
                {to}
              </div>
              <div>
                <span className="font-semibold">Date:</span> {new Date(date).toLocaleString()}
              </div>
            </div>
          </header>
          <section className="prose max-w-none">
            <div className="whitespace-pre-wrap">{body}</div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SMSViewer;
