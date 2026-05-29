import React, {useState, useEffect} from "react";
import axios from "axios";
import { useNotification } from "../context/NotificationContext";

type SMSReplyProps = {
  threadId?: string;
  replyFromParent: string;
};

const SMSReplySection: React.FC<SMSReplyProps> = ({
  threadId,
  replyFromParent
}) => {
  const [reply, setReply] = useState(replyFromParent);
  const [sending, setSending] = useState(false);
  const { notify } = useNotification();

  useEffect(() => {
    setReply(replyFromParent);
  }, [replyFromParent]);

  // Handle reply submit
  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL || ""}/twilio/messages/${threadId}/reply`,
        { content: reply },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      setReply("");
      notify("success", "SMS sent.");
    } catch (err) {
      notify("error", "Failed to send SMS.");
    } finally {
      setSending(false);
    }
  };

  const isEditorEmpty = (text: string | undefined) => {
    return !text || text.trim() === '';
  };

  return (
    <div className="mt-4">
      <div className="bg-white  p-4 shadow">
        <h3 className="text-lg font-semibold mb-2">Reply</h3>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          className="w-full h-40 p-3 border border-gray-300  focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Type your reply here..."
        />
        <button
          className="bg-blue-600 text-white px-6 py-2  hover:bg-blue-700 disabled:opacity-50 mt-2"
          onClick={handleReply}
          disabled={sending || isEditorEmpty(reply)}
        >
          {sending ? "Sending..." : "Send Reply"}
        </button>
      </div>
    </div>
  );
};

export default SMSReplySection;
