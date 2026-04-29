"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./chat.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

type UsageStats = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
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
  const [chatSearch, setChatSearch] = useState("");

  const filteredChats = useMemo(() => {
    const keyword = chatSearch.trim().toLowerCase();

    if (!keyword) return chats;

    return chats.filter((chat) => {
      const titleMatch = chat.title.toLowerCase().includes(keyword);

      const messageMatch = chat.messages.some((msg) =>
        msg.content.toLowerCase().includes(keyword)
      );

      return titleMatch || messageMatch;
    });
  }, [chats, chatSearch]);

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

    const chatsWithoutImages = chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((msg) => ({
        ...msg,
        image: undefined,
      })),
    }));

    localStorage.setItem(
      "my-chatgpt-chats",
      JSON.stringify(chatsWithoutImages)
    );
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

  const [conversationSummary, setConversationSummary] = useState("");

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [lastToolUsed, setLastToolUsed] = useState("");

  const [usageStats, setUsageStats] = useState<UsageStats>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  });

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, loading]);

  useEffect(() => {
    const savedSummary = localStorage.getItem("my-chatgpt-summary");

    if (savedSummary) {
      setConversationSummary(savedSummary);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("my-chatgpt-summary", conversationSummary);
  }, [conversationSummary]);

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

  const routeModel = (input: string, hasImage: boolean): string => {
    const text = input.toLowerCase();

    // 🖼️ 有圖片關鍵字（之後 multimodal 用）
    if (hasImage) {
      return "meta-llama/llama-4-scout-17b-16e-instruct";
    }

    // 🧠 複雜問題（推理 / 計算 / 解釋）
    if (
      text.includes("explain") ||
      text.includes("為什麼") ||
      text.includes("推導") ||
      text.length > 100
    ) {
      return "llama-3.3-70b-versatile";
    }

    // ⚡ 預設走快模型
    return "llama-3.1-8b-instant";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedImage(reader.result as string);
      e.target.value = "";
    };

    reader.readAsDataURL(file);
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const runToolIfNeeded = (userMessage: string) => {
    const text = userMessage.toLowerCase();

    // Calculator tool
    if (
      text.includes("calculate") ||
      text.includes("計算") ||
      text.includes("算一下")
    ) {
      const expression = userMessage
        .replace("calculate", "")
        .replace("計算", "")
        .replace("算一下", "")
        .trim();

      try {
        // demo 用，正式產品不要直接 eval
        const result = Function(`"use strict"; return (${expression})`)();

        return {
          toolName: "Calculator",
          result: `Calculator result: ${expression} = ${result}`,
        };
      } catch {
        return {
          toolName: "Calculator",
          result: "Calculator failed: 無法計算這個表達式。",
        };
      }
    }

    // Time tool
    if (
      text.includes("current time") ||
      text.includes("現在幾點") ||
      text.includes("現在時間")
    ) {
      const now = new Date().toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
      });

      return {
        toolName: "Current Time",
        result: `Current time in Taipei: ${now}`,
      };
    }

    return null;
  };

  const exportCurrentChat = () => {
    if (!activeChat) return;

    const text = activeChat.messages
      .map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        const imageNote = m.image ? "\n[Image attached]" : "";
        return `${role}:\n${m.content}${imageNote}`;
      })
      .join("\n\n--------------------\n\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.title || "chat-history"}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const estimateTokens = (text: string) => {
    // 粗略估算：英文約 4 chars/token；中文通常更接近 1~2 chars/token
    // 作業展示用，非精準計費
    return Math.ceil(text.length / 2);
  };

const getModelRate = (modelName: string) => {
  // 單位：USD / 1M tokens，展示用估算
  // 你可以依照 Groq 官方 pricing 手動調整
  const rates: Record<string, { input: number; output: number }> = {
    "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "meta-llama/llama-4-scout-17b-16e-instruct": {
      input: 0.11,
      output: 0.34,
    },
  };

  return rates[modelName] || { input: 0, output: 0 };
};

const updateUsageStats = (
  modelName: string,
  inputText: string,
  outputText: string
) => {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const totalTokens = inputTokens + outputTokens;
  const rate = getModelRate(modelName);

  const estimatedCost =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;

  setUsageStats((prev) => ({
    inputTokens: prev.inputTokens + inputTokens,
    outputTokens: prev.outputTokens + outputTokens,
    totalTokens: prev.totalTokens + totalTokens,
    estimatedCost: prev.estimatedCost + estimatedCost,
  }));
};

  const summarizeOldMessages = async (messagesToSummarize: Message[]) => {
    if (messagesToSummarize.length === 0) return;

    const oldText = messagesToSummarize
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "請將以下舊對話整理成精簡但完整的長期記憶摘要。保留重要背景、使用者需求、已完成功能、尚未完成事項。請使用繁體中文。",
            },
            {
              role: "user",
              content: `
  Existing summary:
  ${conversationSummary || "No previous summary."}

  Old conversation:
  ${oldText}
  `,
            },
          ],
          temperature: 0.3,
          max_tokens: 700,
        }),
      });

      const data = await res.json();
      const summary = data?.choices?.[0]?.message?.content;

      if (summary) {
        setConversationSummary(summary);
      }
    } catch (error) {
      console.error("Failed to summarize old messages:", error);
    }
  };

  const [currentModel, setCurrentModel] = useState("");

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage = input.trim();
    const imageToSend = selectedImage;

    setInput("");
    setSelectedImage(null);

    const currentMessages = activeChat.messages;
    const updatedMessages: Message[] = [
      ...currentMessages,
      {
        role: "user",
        content: userMessage || "請分析這張圖片。",
        image: imageToSend || undefined,
      },
    ];

    const SUMMARY_THRESHOLD = 18;
    const RECENT_MESSAGE_COUNT = 10;

    const oldMessages =
      updatedMessages.length > SUMMARY_THRESHOLD
        ? updatedMessages.slice(0, updatedMessages.length - RECENT_MESSAGE_COUNT)
        : [];

    const recentMessages =
      updatedMessages.length > SUMMARY_THRESHOLD
        ? updatedMessages.slice(-RECENT_MESSAGE_COUNT)
        : updatedMessages;

    updateChatMessages(chatId, updatedMessages);
    autoTitleIfNeeded(chatId, userMessage);
    setLoading(true);
    
    try {
      const selectedModel = routeModel(userMessage, !!imageToSend);
      setCurrentModel(selectedModel);

      const toolResult = runToolIfNeeded(userMessage);
      setLastToolUsed(toolResult ? toolResult.toolName : "");

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },

        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content: `
            ${systemPrompt}

            Conversation long-term memory:
            ${conversationSummary || "No conversation summary yet."}

            Tool result:
            ${toolResult ? `[${toolResult.toolName}] ${toolResult.result}` : "No tool used."}
            `,
            },
            ...recentMessages.map((m, index) => {
              const isLatestMessage = index === recentMessages.length - 1;

              if (m.image && isLatestMessage) {
                return {
                  role: m.role,
                  content: [
                    {
                      type: "text",
                      text: m.content || "請分析這張圖片。",
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: m.image,
                      },
                    },
                  ],
                };
              }

              if (m.image) {
                return {
                  role: m.role,
                  content: `${m.content}\n\n[這則訊息曾包含一張圖片]`,
                };
              }

              return {
                role: m.role,
                content: m.content,
              };
            }),
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
      } else {
        updateUsageStats(
          selectedModel,
          recentMessages.map((m) => m.content).join("\n"),
          assistantText
        );

        if (oldMessages.length > 0) {
          summarizeOldMessages(oldMessages);
        }
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

              <button className="secondary-btn" onClick={exportCurrentChat}>
                ⬇ Export Chat
              </button>

              <button className="danger-btn" onClick={deleteCurrentChat}>
                🗑 Delete Chat
              </button>
            </div>

            <input
              className="chat-search-input"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search chats..."
            />

            <div className="chat-list">
              {filteredChats.map((chat) => (
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h1 style={{ margin: 0 }}>
              {activeChat?.title || "My ChatGPT"}
            </h1>

            <p
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                margin: 0,
              }}
            >
              Model: {currentModel || "尚未使用"}
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "#38bdf8",
                margin: 0,
              }}
            >
              Tool: {lastToolUsed || "None"}
            </p>
          </div>
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
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="uploaded"
                    className="message-image"
                  />
                )}
                
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

        <div className="input-area-wrapper">
          {selectedImage && (
            <div className="image-preview">
              <img src={selectedImage} alt="preview" />
              <button onClick={removeSelectedImage}>×</button>
            </div>
          )}

          <div className="input-area">
            <label className="upload-btn">
              📎
              <input
                type="file"
                accept="image/*"
                onClick={(e) => {
                  e.currentTarget.value = "";
                }}
                onChange={handleImageUpload}
                hidden
              />
            </label>

            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="輸入訊息，或上傳圖片..."
            />

            <button className="send-btn" onClick={sendMessage}>
              Send
            </button>
          </div>
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
              <label>Conversation Memory Summary</label>

              <div className="summary-box">
                {conversationSummary || "No summary yet. It will be generated automatically when the conversation becomes long."}
              </div>

              {conversationSummary && (
                <button
                  className="danger-btn"
                  onClick={() => {
                    if (confirm("確定要清除 conversation memory summary 嗎？")) {
                      setConversationSummary("");
                      localStorage.removeItem("my-chatgpt-summary");
                    }
                  }}
                >
                  Clear Summary
                </button>
              )}
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

            <div className="settings-group">
              <label>Token / Cost Estimate</label>
              <div className="usage-box">
                <div>Input tokens: {usageStats.inputTokens}</div>
                <div>Output tokens: {usageStats.outputTokens}</div>
                <div>Total tokens: {usageStats.totalTokens}</div>
                <div>Estimated cost: ${usageStats.estimatedCost.toFixed(6)}</div>
              </div>
            </div>
          </>
        )}
      </aside>
    </main>
  );
}