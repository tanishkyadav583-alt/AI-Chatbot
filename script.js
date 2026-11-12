const API_KEY = "PASTE_YOUR_GEMINI_API_KEY";
const MODEL = "gemini-3.5-flash-lite";

const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const historyList = document.getElementById("historyList");

let isLoading = false;
let sessions = JSON.parse(localStorage.getItem("aiChats") || "[]");
let currentId = null;

function saveChats() {
    localStorage.setItem("aiChats", JSON.stringify(sessions));
}

function getCurrentChat() {
    return sessions.find(chat => chat.id === currentId);
}

function updateChatTitle(chat) {
    const firstMessage = chat.messages.find(
        message => message.sender === "user"
    );

    chat.title = firstMessage
        ? firstMessage.text.slice(0, 25)
        : "New Chat";
}

function createChat() {
    const chat = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        title: "New Chat",
        messages: [],
        createdAt: new Date().toISOString()
    };

    sessions.unshift(chat);
    currentId = chat.id;

    saveChats();
    renderHistory();
    renderChat();
}

function renderHistory() {
    historyList.innerHTML = "";

    sessions.forEach(chat => {
        const item = document.createElement("div");
        item.className = "history-item";

        if (chat.id === currentId) {
            item.classList.add("active");
        }

        const title = document.createElement("span");
        title.className = "history-title";
        title.textContent = chat.title;

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-history";
        deleteBtn.textContent = "✕";
        deleteBtn.title = "Delete chat";

        item.addEventListener("click", () => {
            openChat(chat.id);
        });

        deleteBtn.addEventListener("click", event => {
            event.stopPropagation();
            deleteChat(chat.id);
        });

        item.appendChild(title);
        item.appendChild(deleteBtn);

        historyList.appendChild(item);
    });
}

function openChat(id) {
    if (isLoading) return;

    currentId = id;

    renderHistory();
    renderChat();
}

function renderChat() {
    const chat = getCurrentChat();

    chatBox.innerHTML = "";

    if (!chat || chat.messages.length === 0) {
        chatBox.innerHTML = `
            <div class="welcome">
                <div class="welcome-icon">✦</div>
                <span class="eyebrow">WELCOME TO ORBIT</span>
                <h1>Ideas start here.</h1>
                <p>Ask a question, explore an idea, or get help with something new.</p>
            </div>
        `;
        return;
    }

    chat.messages.forEach((message, index) => {
        addMessage(message.text, message.sender, index);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
}

function addMessage(message, sender, index = null) {
    const welcome = chatBox.querySelector(".welcome");

    if (welcome) welcome.remove();

    const div = document.createElement("div");
    div.className = `message ${sender}`;

    const text = document.createElement("div");
    text.textContent = message;

    div.appendChild(text);

    if (sender === "user" && index !== null) {
        const editBtn = document.createElement("button");

        editBtn.textContent = "✎ Edit";
        editBtn.className = "edit-message";

        editBtn.addEventListener("click", () => {
            editMessage(index);
        });

        div.appendChild(editBtn);
    }

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    return div;
}

function editMessage(index) {
    if (isLoading) return;

    const chat = getCurrentChat();

    if (!chat || chat.messages[index]?.sender !== "user") return;

    const oldMessage = chat.messages[index].text;

    chat.messages = chat.messages.slice(0, index);

    updateChatTitle(chat);

    userInput.value = oldMessage;

    saveChats();
    renderHistory();
    renderChat();

    userInput.focus();

    userInput.setSelectionRange(
        userInput.value.length,
        userInput.value.length
    );
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAIResponse(contents) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    for (let attempt = 1; attempt <= 3; attempt++) {
        let response;

        try {
            response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{
                            text: "You are a helpful AI assistant. Give clear, accurate and friendly answers."
                        }]
                    },
                    contents: contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    }
                })
            });

        } catch (error) {
            if (attempt === 3) {
                throw new Error("Network error. Check your internet connection.");
            }

            await wait(attempt * 2000);
            continue;
        }

        const data = await response.json();

        if (response.ok) {
            const reply = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

            if (!reply) {
                throw new Error("No response received from AI.");
            }

            return reply;
        }

        if ([429, 500, 503, 408].includes(response.status)) {
            if (attempt < 3) {
                await wait(attempt * 2000);
                continue;
            }
        }

        throw new Error(
            `HTTP ${response.status}: ${data.error?.message || "API request failed"}`
        );
    }

    throw new Error("AI service is unavailable. Please try again.");
}

async function sendMessage() {
    const message = userInput.value.trim();

    if (!message || isLoading) return;

    if (!API_KEY || API_KEY === "PASTE_YOUR_GEMINI_API_KEY") {
        alert("Please add your Gemini API key.");
        return;
    }

    if (!currentId) {
        createChat();
    }

    const chat = getCurrentChat();

    if (!chat) return;

    const previousMessages = [...chat.messages];

    chat.messages.push({
        text: message,
        sender: "user"
    });

    updateChatTitle(chat);

    userInput.value = "";

    saveChats();
    renderHistory();
    renderChat();

    isLoading = true;
    sendBtn.disabled = true;

    const loading = addMessage("AI is thinking...", "bot");

    const contents = chat.messages.map(item => ({
        role: item.sender === "user" ? "user" : "model",
        parts: [{ text: item.text }]
    }));

    try {
        const reply = await getAIResponse(contents);

        chat.messages.push({
            text: reply,
            sender: "bot"
        });

        saveChats();

        loading.textContent = reply;

    } catch (error) {
        chat.messages = previousMessages;

        updateChatTitle(chat);
        saveChats();
        renderHistory();

        loading.textContent = "Error: " + error.message;

    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

function deleteChat(id) {
    if (isLoading) return;

    sessions = sessions.filter(chat => chat.id !== id);

    if (currentId === id) {
        currentId = sessions.length
            ? sessions[0].id
            : null;
    }

    saveChats();

    if (!currentId) {
        createChat();
    } else {
        renderHistory();
        renderChat();
    }
}

function clearChat() {
    if (isLoading) return;

    const chat = getCurrentChat();

    if (!chat) return;

    chat.messages = [];

    updateChatTitle(chat);

    saveChats();
    renderHistory();
    renderChat();
}

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        sendMessage();
    }
});

document.getElementById("newChat").addEventListener("click", () => {
    if (isLoading) return;

    createChat();
});

document.getElementById("clearChat").addEventListener("click", clearChat);

if (sessions.length > 0) {
    currentId = sessions[0].id;

    sessions.forEach(chat => {
        updateChatTitle(chat);
    });

    saveChats();
    renderHistory();
    renderChat();

} else {
    createChat();
}