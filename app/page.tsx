"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./chat.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

export default function Home() {
  const API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";

  const initialChat: ChatSession = {
    id: "default-chat",
    title: "New Chat",
    messages: [],
    createdAt: 0,
  };

  const [chats, setChats] = useState<ChatSession[]>([initialChat]);
  const [activeChatId, setActiveChatId] = useState<string>("default-chat");
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    const savedChats = localStorage.getItem("my-chatgpt-chats");
    const savedActiveChatId = localStorage.getItem("my-chatgpt-active");

    if (savedChats) {
      const parsedChats: ChatSession[] = JSON.parse(savedChats);

      if (parsedChats.length > 0) {
        setChats(parsedChats);

        if (
          savedActiveChatId &&
          parsedChats.some((chat) => chat.id === savedActiveChatId)
        ) {
          setActiveChatId(savedActiveChatId);
        } else {
          setActiveChatId(parsedChats[0].id);
        }
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("my-chatgpt-chats", JSON.stringify(chats));
  }, [chats, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("my-chatgpt-active", activeChatId);
  }, [activeChatId, isHydrated]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [systemPrompt, setSystemPrompt] = useState("你是一個友善的助理。");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, loading]);

  const createNewChat = () => {
    const newChat: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput("");
  };

  const deleteCurrentChat = () => {
    if (!activeChatId) return;

    const ok = confirm("確定要刪除目前這個聊天嗎？");
    if (!ok) return;

    const remainingChats = chats.filter((chat) => chat.id !== activeChatId);

    if (remainingChats.length === 0) {
      const newChat: ChatSession = {
        id: crypto.randomUUID(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
      };

      setChats([newChat]);
      setActiveChatId(newChat.id);
      setInput("");
      return;
    }

    setChats(remainingChats);
    setActiveChatId(remainingChats[0].id);
    setInput("");
  };

  const updateChatMessages = (chatId: string, messages: Message[]) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, messages } : chat))
    );
  };

  const renameChat = (chatId: string, newTitle: string) => {
    const cleaned = newTitle.trim() || "Untitled Chat";
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, title: cleaned } : chat))
    );
  };

  const startRename = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
  };

  const submitRename = () => {
    if (!editingChatId) return;
    renameChat(editingChatId, editingTitle);
    setEditingChatId(null);
    setEditingTitle("");
  };

  const autoTitleIfNeeded = (chatId: string, firstUserMessage: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        if (chat.title !== "New Chat") return chat;
        return {
          ...chat,
          title: firstUserMessage.trim().slice(0, 24) || "New Chat",
        };
      })
    );
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage = input.trim();
    setInput("");

    const currentMessages = activeChat.messages;
    const updatedMessages: Message[] = [
      ...currentMessages,
      { role: "user", content: userMessage },
    ];

    updateChatMessages(chatId, updatedMessages);
    autoTitleIfNeeded(chatId, userMessage);
    setLoading(true);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const errorText = await res.text();
        console.error("Groq API error:", res.status, errorText);
        updateChatMessages(chatId, [
          ...updatedMessages,
          { role: "assistant", content: "發生錯誤，請稍後再試。" },
        ]);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantText = "";

      // 先放一個空 assistant bubble
      updateChatMessages(chatId, [
        ...updatedMessages,
        { role: "assistant", content: "" },
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.replace(/^data:\s*/, "");

          if (dataStr === "[DONE]") continue;

          try {
            const json = JSON.parse(dataStr);
            const delta = json.choices?.[0]?.delta?.content || "";

            if (delta) {
              assistantText += delta;

              updateChatMessages(chatId, [
                ...updatedMessages,
                { role: "assistant", content: assistantText },
              ]);
            }
          } catch {
            // 忽略非完整 JSON 片段
          }
        }
      }

      if (!assistantText) {
        updateChatMessages(chatId, [
          ...updatedMessages,
          { role: "assistant", content: "AI 沒回應" },
        ]);
      }
    } catch (error) {
      console.error(error);
      updateChatMessages(chatId, [
        ...updatedMessages,
        { role: "assistant", content: "發生錯誤，請稍後再試。" },
      ]);
    }

    setLoading(false);
  };

  if (!isHydrated) {
    return (
      <main className="app-shell">
        <div style={{ color: "white", padding: "20px" }}>Loading...</div>
      </main>
    );
  }

  return (
    <main
      className={`app-shell ${leftOpen ? "left-open" : "left-closed"} ${
        rightOpen ? "right-open" : "right-closed"
      }`}
    >
      <aside className={`left-panel ${leftOpen ? "" : "collapsed"}`}>
        <div className="panel-topbar">
          <button className="collapse-btn" onClick={() => setLeftOpen((v) => !v)}>
            {leftOpen ? "◀" : "▶"}
          </button>
        </div>

        {leftOpen && (
          <>
            <div className="panel-header">
              <button className="new-chat-btn" onClick={createNewChat}>
                + New Chat
              </button>

              <button className="danger-btn" onClick={deleteCurrentChat}>
                🗑 Delete Chat
              </button>
            </div>

            <div className="chat-list">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-list-item ${
                    chat.id === activeChatId ? "active-chat" : ""
                  }`}
                >
                  {editingChatId === chat.id ? (
                    <input
                      className="rename-input"
                      value={editingTitle}
                      autoFocus
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename();
                        if (e.key === "Escape") {
                          setEditingChatId(null);
                          setEditingTitle("");
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="chat-list-button"
                      onClick={() => setActiveChatId(chat.id)}
                      onDoubleClick={() => startRename(chat.id, chat.title)}
                      title="雙擊重新命名"
                    >
                      {chat.title}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="center-panel">
        <div className="center-header">
          <h1>{activeChat?.title || "My ChatGPT"}</h1>
        </div>

        <div className="messages-area">
          {activeChat && activeChat.messages.length === 0 && (
            <div className="empty-state">
              <h2>開始一段新的對話</h2>
              <p>雙擊左邊聊天標題可以重新命名。</p>
            </div>
          )}

          {activeChat?.messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message-row ${
                msg.role === "user" ? "user-row" : "assistant-row"
              }`}
            >
              <div className={`message-bubble ${msg.role}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {loading && activeChat?.messages.at(-1)?.role === "user" && (
            <div className="message-row assistant-row">
              <div className="message-bubble assistant typing">思考中...</div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="輸入訊息..."
          />
          <button className="send-btn" onClick={sendMessage}>
            Send
          </button>
        </div>
      </section>

      <aside className={`right-panel ${rightOpen ? "" : "collapsed"}`}>
        <div className="panel-topbar right-topbar">
          <button className="collapse-btn" onClick={() => setRightOpen((v) => !v)}>
            {rightOpen ? "▶" : "◀"}
          </button>
        </div>

        {rightOpen && (
          <>
            <div className="settings-group">
              <label>LLM Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              </select>
            </div>

            <div className="settings-group">
              <label>System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={8}
              />
            </div>

            <div className="settings-group">
              <label>Temperature: {temperature}</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>

            <div className="settings-group">
              <label>Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </>
        )}
      </aside>
    </main>
  );
}