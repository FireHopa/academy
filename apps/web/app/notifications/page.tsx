"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { apiFetch } from "@/lib/api";
import { GoogleText } from "@/components/google-text";
import { useStudentSession } from "@/components/student-session";

type Notification={id:string;title:string;message:string;linkUrl:string|null;readAt:string|null;createdAt:string};
const fmt=(v:string)=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));

export default function NotificationsPage(){
  const {refreshNotifications}=useStudentSession();
  const [items,setItems]=useState<Notification[]>([]);const [unread,setUnread]=useState(0);const [error,setError]=useState("");
  async function load(){setError("");try{const r=await apiFetch<{unread:number;notifications:Notification[]}>("/experience/notifications");setItems(r.notifications);setUnread(r.unread)}catch(e){setError(e instanceof Error?e.message:"Falha ao carregar notificações")}}
  useEffect(()=>{void load()},[]);
  async function read(item:Notification){if(item.readAt)return;setError("");try{await apiFetch(`/experience/notifications/${item.id}/read`,{method:"POST"});setItems(current=>current.map(candidate=>candidate.id===item.id?{...candidate,readAt:new Date().toISOString()}:candidate));setUnread(current=>Math.max(0,current-1));await refreshNotifications().catch(()=>undefined)}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao atualizar a notificação")}}
  async function readAll(){setError("");try{await apiFetch("/experience/notifications/read-all",{method:"POST"});const now=new Date().toISOString();setItems(current=>current.map(item=>({...item,readAt:item.readAt||now})));setUnread(0);await refreshNotifications().catch(()=>undefined)}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao atualizar as notificações")}}
  return <main><section className="standard-head"><div className="eyebrow">Central</div><h1>Notificações</h1><p>{unread?`${unread} aviso${unread>1?"s":""} ainda não lido${unread>1?"s":""}.`:"Você está em dia com seus avisos."}</p></section><section className="standard-content notifications-page">{error&&<div className="form-error">{error} <button className="mini-button" type="button" onClick={()=>void load()}>Tentar novamente</button></div>}<div className="section-head"><h2>Seus avisos</h2>{unread>0&&<button className="btn btn-secondary" onClick={()=>void readAll()}>Marcar todas como lidas</button>}</div><div className="notification-list">{items.map(item=>{const content=<div className={`notification-card ${item.readAt?"":"unread"}`} onClick={item.linkUrl?undefined:()=>void read(item)}><div className="notification-dot"/><div><div className="notification-head"><b><GoogleText>{item.title}</GoogleText></b><span>{fmt(item.createdAt)}</span></div><p><GoogleText>{item.message}</GoogleText></p>{item.linkUrl&&<small>Abrir conteúdo →</small>}</div></div>;return item.linkUrl?<Link key={item.id} href={item.linkUrl} onClick={()=>void read(item)}>{content}</Link>:<div key={item.id}>{content}</div>})}{!items.length&&!error&&<div className="empty-block">Nenhuma notificação por enquanto.</div>}</div></section></main>
}
