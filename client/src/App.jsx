import { useEffect, useRef, useState } from "react";
import { Check, LogOut, MessageCircle, Plus, Send, Shield, Trash2, Users, Wifi } from "lucide-react";

const socketUrl = "ws://localhost:8800";

export default function App() {
    const [socket, setSocket] = useState(null);
    const [screen, setScreen] = useState("login");
    const [form, setForm] = useState({ username: "", password: "", confirm: "", nickname: "" });
    const [authMode, setAuthMode] = useState("login");
    const [state, setState] = useState(null);
    const [messages, setMessages] = useState([]);
    const [privateMessages, setPrivateMessages] = useState([]);
    const [selectedUser, setSelectedUser] = useState("");
    const [draft, setDraft] = useState("");
    const [notice, setNotice] = useState("");
    const [roomDraft, setRoomDraft] = useState("");
    const [announcement, setAnnouncement] = useState("");
    const bottom = useRef(null);

    useEffect(() => {
        const connection = new WebSocket(socketUrl);
        connection.onopen = () => connection.send(JSON.stringify({ type: "bridge" }));
        connection.onmessage = ({ data }) => {
            let event;
            try {
                event = JSON.parse(data);
            } catch {
                return setNotice("Received an invalid message from the bridge.");
            }
            if (event.type === "error") return setNotice(event.message);
            if (event.type === "room_access") {
                if (event.status === "pending") {
                    setState((current) => current && ({ ...current, pendingRooms: [...new Set([...(current.pendingRooms || []), event.room])] }));
                }
                if (event.status === "rejected") setNotice(`Your request to join ${event.room} was rejected. You can request again.`);
                if (event.status === "removed") setNotice(`You were removed from ${event.room}.`);
                if (event.status === "approved") setNotice(`Your request to join ${event.room} was approved.`);
                if (event.status === "denied") setNotice(`You are not a member of ${event.room}. Request access before entering.`);
                return;
            }
            if (event.type === "join_request") {
                setState((current) => {
                    if (!current) return current;
                    const ownedRooms = (current.ownedRooms || []).map((room) => room.name !== event.room ? room : {
                        ...room,
                        pendingRequests: [...room.pendingRequests.filter((request) => request.username !== event.request.username), event.request]
                    });
                    return {
                        ...current,
                        ownedRooms,
                        pendingRequests: current.currentRoom === event.room ? ownedRooms.find((room) => room.name === event.room)?.pendingRequests || [] : current.pendingRequests
                    };
                });
                return;
            }
            if (event.type === "auth" && event.status === "registered") { setNotice(event.message); setAuthMode("login"); return; }
            if (event.type === "auth" && event.status === "ok") { setScreen("nickname"); setNotice(""); return; }
            if (event.type === "state" && Array.isArray(event.rooms) && Array.isArray(event.users)) { setState(event); if (event.nickname) setScreen("chat"); return; }
            if (event.type === "room_history") { setMessages(Array.isArray(event.messages) ? event.messages.filter(Boolean) : []); return; }
            if (event.type === "chat" && event.room && event.sender && event.timestamp) { setMessages((items) => [...items, event]); return; }
            if (event.type === "private") { setPrivateMessages((items) => [...items, event]); return; }
            if (event.type === "announcement") { setNotice(`Announcement in ${event.room}: ${event.message}`); return; }
            if (event.type === "logged_out") { setScreen("login"); setState(null); }
        };
        connection.onerror = () => setNotice("Bridge unavailable. Start the TCP server and bridge first.");
        connection.onclose = () => setSocket(null);
        setSocket(connection);
        return () => connection.close();
    }, []);

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, privateMessages]);

    const send = (payload) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const submitAuth = (event) => {
        event.preventDefault();
        if (authMode === "register" && form.password !== form.confirm) return setNotice("Passwords do not match.");
        send({ type: authMode, username: form.username, password: form.password });
    };
    const submitChat = (event) => {
        event.preventDefault();
        if (!draft.trim()) return;
        send(selectedUser ? { type: "private", to: selectedUser, message: draft } : { type: "chat", message: draft });
        setDraft("");
    };
    const roomMessages = messages.filter((item) => item && item.room === state?.currentRoom);

    if (screen === "login" || screen === "register") return <AuthPage mode={screen} authMode={authMode} form={form} update={update} submit={submitAuth} notice={notice} setAuthMode={setAuthMode} setScreen={setScreen} />;
    if (screen === "nickname") return <Nickname form={form} update={update} submit={(event) => { event.preventDefault(); send({ type: "set_nickname", nickname: form.nickname }); }} notice={notice} />;
    if (!state) return <div className="loading">Connecting to bridge...</div>;

    return <main className="app-shell">
        <aside className="sidebar">
            <div className="brand"><span className="brand-mark"><Wifi size={18} /></span><div><strong>WireRoom</strong><small>TCP CHAT NETWORK</small></div></div>
            <div className="identity"><span className="avatar">{state.nickname[0]}</span><div><strong>{state.nickname}</strong><small>{state.username}</small></div><span className="online-dot" /></div>
            <div className="side-label">Rooms</div>
            <nav>{state.rooms.map((room) => {
                const admin = state.adminRooms?.includes(room);
                const member = admin || state.memberRooms?.includes(room);
                const pending = state.pendingRooms?.includes(room);
                const pendingCount = state.ownedRooms?.find((ownedRoom) => ownedRoom.name === room)?.pendingRequests.length || 0;
                if (!member) return <div className="room room-request" key={room}><MessageCircle size={15} /><span className="room-name">{room}</span>{pending ? <small>Request Pending</small> : <button onClick={() => send({ type: "request_join", room })}>Request to Join</button>}</div>;
                return <button className={room === state.currentRoom ? "room active" : "room"} onClick={() => { setSelectedUser(""); send({ type: "join", room }); }} key={room}><MessageCircle size={15} />{room}<span>{admin ? <><Shield size={13} title="Room admin" />{pendingCount > 0 && <small className="pending-count">{pendingCount}</small>}</> : room === state.currentRoom ? "●" : <Check size={13} title="Room member" />}</span></button>;
            })}</nav>
            <button className="leave-room" onClick={() => send({ type: "leave" })}>Return to General</button>
            <div className="sidebar-bottom"><div className="connection"><span className="online-dot" /> Connected via bridge</div><button className="logout" onClick={() => send({ type: "logout" })}><LogOut size={15} /> Log out</button></div>
        </aside>
        <section className="workspace">
            <header className="topbar"><div><p className="eyebrow">ROOM / {state.currentRoom.toUpperCase()}</p><h1>{selectedUser ? `Private message · ${selectedUser}` : state.currentRoom}</h1></div><div className="room-meta"><span><Users size={15} /> {state.users.length} online</span><span className="protocol"><Wifi size={14} /> RAW TCP</span></div></header>
            {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
            <div className="content-grid"><section className="conversation"><div className="message-list">{selectedUser ? privateMessages.filter((item) => item.sender === selectedUser || item.to === selectedUser).map((item, index) => <Message item={item} own={item.sender === state.nickname} key={index} />) : roomMessages.map((item, index) => <Message item={item} own={item.sender === state.nickname} key={index} />)}<div ref={bottom} /></div><form className="composer" onSubmit={submitChat}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedUser ? `Message ${selectedUser} privately...` : `Message #${state.currentRoom}`} /><button title="Send message"><Send size={18} /></button></form></section>
                <aside className="right-rail"><div className="rail-section"><div className="rail-heading"><span>ONLINE USERS</span><strong>{state.users.length}</strong></div>{state.users.map((user) => <button className={selectedUser === user.nickname ? "user-row selected" : "user-row"} onClick={() => setSelectedUser(user.nickname === state.nickname ? "" : user.nickname)} key={user.nickname}><span className="user-avatar">{user.nickname[0]}</span><span><strong>{user.nickname}</strong><small>#{user.room}</small></span><i /></button>)}</div><Admin send={send} roomDraft={roomDraft} setRoomDraft={setRoomDraft} announcement={announcement} setAnnouncement={setAnnouncement} rooms={state.rooms} adminRooms={state.adminRooms || []} currentRoom={state.currentRoom} isRoomAdmin={state.adminRooms?.includes(state.currentRoom) || state.isRoomAdmin} roomMembers={state.roomMembers || []} pendingRequests={state.pendingRequests || []} ownedRooms={state.ownedRooms || []} username={state.username} /></aside></div>
        </section>
    </main>;
}

function Message({ item, own }) { return <article className={own ? "message own" : "message"}><div className="message-head"><strong>{item.sender}</strong><time>{new Date(item.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div><p>{item.message}</p></article>; }

function AuthPage({ mode, authMode, form, update, submit, notice, setAuthMode, setScreen }) { return <main className="auth-shell"><div className="auth-art"><span className="brand-mark"><Wifi size={20} /></span><p className="eyebrow">COMPUTER NETWORKS PROJECT</p><h1>Conversations,<br /><em>connected.</em></h1><p className="art-copy">A multi-user room chat carried over a reliable TCP stream.</p><div className="signal"><span /><span /><span /><span /><span /></div></div><section className="auth-card"><div className="auth-mobile-brand"><span className="brand-mark"><Wifi size={18} /></span> WireRoom</div><p className="eyebrow">{mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}</p><h2>{mode === "login" ? "Sign in to your network" : "Join the network"}</h2><p className="subtle">{mode === "login" ? "Enter your account details to continue." : "Your username is separate from your chat nickname."}</p><form onSubmit={submit}><label>Username<input required value={form.username} onChange={(event) => update("username", event.target.value)} /></label><label>Password<input required type="password" minLength="6" value={form.password} onChange={(event) => update("password", event.target.value)} /></label>{mode === "register" && <label>Confirm password<input required type="password" value={form.confirm} onChange={(event) => update("confirm", event.target.value)} /></label>}<button className="primary" type="submit">{mode === "login" ? "Sign in" : "Create account"}<Send size={16} /></button></form>{notice && <p className="form-error">{notice}</p>}<p className="switch">{mode === "login" ? "New here?" : "Already registered?"} <button onClick={() => { setScreen(mode === "login" ? "register" : "login"); setAuthMode(mode === "login" ? "register" : "login"); }}> {mode === "login" ? "Create an account" : "Sign in"}</button></p></section></main>; }

function Nickname({ form, update, submit, notice }) { return <main className="auth-shell nickname-shell"><section className="auth-card"><span className="brand-mark"><Wifi size={20} /></span><p className="eyebrow">CHAT IDENTITY</p><h2>Choose your nickname</h2><p className="subtle">This is how other people will see you. It is not your account username.</p><form onSubmit={submit}><label>Nickname<input autoFocus required value={form.nickname} onChange={(event) => update("nickname", event.target.value)} /></label><button className="primary">Enter the chat <Send size={16} /></button></form>{notice && <p className="form-error">{notice}</p>}</section></main>; }

function Admin({ send, roomDraft, setRoomDraft, announcement, setAnnouncement, rooms, adminRooms, currentRoom, isRoomAdmin, roomMembers, pendingRequests, username }) { return <div className="admin-panel"><div className="rail-heading"><span>{isRoomAdmin ? `ROOM CONTROLS · ${currentRoom}` : "ROOM ACCESS"}</span></div><form onSubmit={(event) => { event.preventDefault(); send({ type: "create_room", room: roomDraft }); setRoomDraft(""); }}><label>Create room<input value={roomDraft} onChange={(event) => setRoomDraft(event.target.value)} placeholder="e.g. Movies" /></label><button className="small-button"><Plus size={14} /> Add room</button></form>{isRoomAdmin && <><section className="room-admin-section"><div className="rail-heading"><span>MEMBERS</span><strong>{roomMembers.length}</strong></div>{roomMembers.map((member) => <div className="admin-person" key={member.username}><span>{member.nickname}{member.username === username ? " · Admin" : member.online ? " · online" : " · offline"}</span>{member.username !== username && <button className="small-button secondary-button" onClick={() => send({ type: "kick", username: member.username })}>Kick</button>}</div>)}</section><section className="room-admin-section"><div className="rail-heading"><span>JOIN REQUESTS</span><strong>{pendingRequests.length}</strong></div>{pendingRequests.length === 0 && <p className="empty-admin-list">No pending requests</p>}{pendingRequests.map((request) => <div className="admin-person" key={`${request.room}-${request.username}`}><span>{request.nickname}<small>{request.requestingUsername}</small></span><div><button className="small-button" onClick={() => send({ type: "approve_join", room: currentRoom, username: request.username })}>Approve</button><button className="small-button secondary-button" onClick={() => send({ type: "reject_join", room: currentRoom, username: request.username })}>Reject</button></div></div>)}</section><form onSubmit={(event) => { event.preventDefault(); send({ type: "announce", message: announcement }); setAnnouncement(""); }}><label>Announcement for {currentRoom}<input value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Send to this room" /></label><button className="small-button">Broadcast</button></form><button className="small-button secondary-button" onClick={() => send({ type: "delete_room", room: currentRoom })} disabled={currentRoom === "General"}><Trash2 size={14} /> Delete {currentRoom}</button></>}</div>; }
