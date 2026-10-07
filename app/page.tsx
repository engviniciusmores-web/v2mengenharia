"use client";
import { useEffect, useState } from "react";
const modules = [
 ["Projetos e modelos", "/projetos", "Biblioteca de IFCs na nuvem e composição de até 20 modelos."],
 ["Planejamento", "/planejamento", "Cronograma, EAP, medições e integração com Navisworks."],
 ["Custos e Curva S", "/compras?tab=curva", "Orçado, contratado, medido, pago e projeção final."],
 ["Compras", "/compras?tab=pedidos", "Pedidos, fornecedores, itens do orçamento e vínculos com o IFC."],
 ["Quantitativos", "/compras?tab=orcamento", "Base de quantidades e preços por item da obra."],
 ["Qualidade", "/qualidade", "Inspeções por elemento, controle de concretagem e fotos."],
 ["Diário de obra", "/diario", "Importação de pasta de RDO, documentos e fotos por dia."],
];
export default function Home() {
 const [activeFederation,setActiveFederation]=useState<{id:string;name:string;project_name:string}|null>(null);
 const [federatedTasks,setFederatedTasks]=useState<number|null>(null);
 useEffect(()=>{let alive=true;fetch("/api/models/active",{cache:"no-store"}).then(r=>r.ok?r.json<any>():null).then(async data=>{if(!alive||!data?.federation)return;setActiveFederation(data.federation);const r=await fetch("/api/planning/bundle?federation="+encodeURIComponent(data.federation.id),{cache:"no-store"});if(r.ok&&alive){const bundle=await r.json<any>();setFederatedTasks(bundle.wbs_rows?.length||0);}}).catch(()=>{});return()=>{alive=false;};},[]);
 const [project,setProject] = useState("Minha obra");
 const [draft,setDraft] = useState("Minha obra");
 const [notice,setNotice] = useState("");
 const [sequenceInfo,setSequenceInfo] = useState("");
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.data?.type==='v2m-ifc-inventory')setSequenceInfo(`${event.data.inventory.elements.length} elementos analisados. A sequência executiva sugerida está disponível em Planejamento.`);};window.addEventListener('message',receive);return ()=>window.removeEventListener('message',receive);},[]);
 useEffect(()=>{ fetch('/api/project').then(r=>r.ok?r.json<any>():null).then(d=>{if(d?.name){setProject(d.name);setDraft(d.name);}}).catch(()=>setNotice('Não foi possível consultar o nome da obra.')); },[]);
 async function saveProject(){const r=await fetch('/api/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:draft.trim()})});if(r.ok){setProject(draft.trim());setNotice('Nome da obra salvo.');}else setNotice('Não foi possível salvar o nome da obra.');}
 return <div className="app-shell v2m-home">
 <aside className="sidebar"><div className="side-brand"><img src="/v2m-brand.svg" alt="V2M ENGENHARIA"/></div><div className="project-card"><b>{project}</b><small>Gestão integrada de obras</small></div><p className="nav-label">OBRA</p><nav><a className="active" href="/">Visão geral</a>{modules.map(([name,url])=><a key={name} href={name==="Planejamento"&&activeFederation?`/planejamento?federation=${encodeURIComponent(activeFederation.id)}`:url}>{name}</a>)}<a href="#visualizador">BIM 4D / 5D</a></nav><div className="side-foot">V2M ENGENHARIA<small>Planejamento · Controle · BIM</small></div></aside>
 <main><header className="command-bar"><b>V2M ENGENHARIA</b><button className="v2m-button" onClick={()=>window.print()}>Exportar visão</button></header>
 <section className="page-title"><div><p>VISÃO GERAL</p><h1>{project}</h1><small>Configure a base da obra e carregue seu IFC quando for utilizar.</small></div></section>
 <section className="v2m-setup"><div><h2>Configuração da obra</h2><label>Nome da obra<input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={120}/></label><button className="v2m-button" disabled={!draft.trim()} onClick={()=>void saveProject()}>Salvar nome</button><p role="status">{notice}</p></div><div><h2>Comece pela base</h2><ol><li>Importe o cronograma XML em Planejamento.</li><li>Importe o orçamento em Quantitativos.</li><li>Selecione seu IFC no visualizador abaixo.</li><li>Confira datas, vínculos e pesos antes da medição.</li></ol></div></section>
 <section className="v2m-modules">{modules.map(([name,url,desc],i)=><a href={name==="Planejamento"&&activeFederation?`/planejamento?federation=${encodeURIComponent(activeFederation.id)}`:url} key={name}><small>0{i+1}</small><h2>{name}</h2><p>{desc}</p><span>Abrir módulo</span></a>)}</section>
 <section className="panel bim-viewer-panel" id="visualizador"><div className="panel-title"><h2>{activeFederation?"Modelo federado · 4D / 5D":"Modelo IFC · 4D / 5D"}</h2><span>{activeFederation?.name||"ABRIR ARQUIVO"}</span></div><iframe title="Visualizador IFC V2M ENGENHARIA" src={activeFederation?`/bim-viewer/federated.html?mode=planning&federation=${encodeURIComponent(activeFederation.id)}`:"/bim-viewer/index.html?mode=planning&bundle=/api/planning/bundle"}/>{sequenceInfo && <p role="status">{sequenceInfo} <a href="/planejamento">Abrir cronograma sugerido</a></p>}<div className="federated-home-actions">{activeFederation&&<><b>{activeFederation.project_name} · {federatedTasks===null?"Cronograma a revisar e salvar":`${federatedTasks} atividades salvas`}</b><a className="v2m-button" href={"/planejamento?federation="+encodeURIComponent(activeFederation.id)}>Abrir Gantt desta composição</a></>}<a href="/projetos">Escolher composição na biblioteca</a></div><p className="viewer-note">{activeFederation?"A composição usa os IFCs armazenados na sua biblioteca privada. O cronograma e as medições pertencem a esta composição; confira as premissas antes de utilizar os indicadores.":<>O IFC é processado no seu navegador e fica disponível nesta sessão entre os módulos. Nenhum arquivo IFC é enviado ao servidor. Avanço e custo dependem de cronograma, vínculos e orçamento validados.</>}</p></section>
 <section className="panel" id="alertas" style={{marginTop:20}}><div className="panel-title"><h2>SMS e pendências técnicas</h2></div><p>Registre ocorrências e evidências no diário de obra. Antes da execução, confira as liberações de qualidade, os projetos e as condições de segurança.</p><a href="/diario">Abrir diário de obra</a></section></main></div>;
}
