// Project naming conventions complement IFC classes; source fields are retained.
const clean=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const get=(sets,setName,key)=>sets.find(s=>clean(s.name)===clean(setName))?.properties.find(p=>clean(p.name)===clean(key))?.value;
export function interpretElement(element) {
 const sets=element.propertySets||[];
 const qualified=key=>get(sets,'TQS_Padrao',key);
 const title=qualified('Titulo')||element.tag||element.name||'';
 const structuralType=qualified('Tipo')||element.objectType||element.description||'';
 const geometryType=get(sets,'TQS_Geometria','Tipo')||'';
 const text=clean(`${structuralType} ${geometryType}`),code=String(title).trim().toUpperCase();
 let kind='',source='';
 // Direct IFC class is authoritative unless it is generic.
 const byType={IFCCOLUMN:'Pilares',IFCBEAM:'Vigas',IFCSLAB:'Lajes',IFCFOOTING:'Fundações',IFCPILE:'Estacas',IFCSTAIR:'Escadas',IFCSTAIRFLIGHT:'Escadas',IFCRAMP:'Rampas',IFCRAMPFLIGHT:'Rampas'};
 if(byType[String(element.type).toUpperCase()]){kind=byType[String(element.type).toUpperCase()];source=`Classe IFC: ${element.type}`;}
 else if(/sapata|fundac|radier|bloco/.test(text)){kind='Fundações';source='TQS_Padrao.Tipo / TQS_Geometria.Tipo';}
 else if(/pilar|column/.test(text)){kind='Pilares';source='TQS_Padrao.Tipo / ObjectType / Description';}
 else if(/viga|beam/.test(text)){kind='Vigas';source='TQS_Padrao.Tipo / ObjectType / Description';}
 else if(/laje|slab/.test(text)){kind='Lajes';source='TQS_Padrao.Tipo / ObjectType / Description';}
 else if(/escada/.test(text)){kind='Escadas';source='Propriedade de tipo';}
 else if(/^(?:P|PJ|PL)\s*[-._]?\s*\d+[A-Z]?(?:\b|$)/.test(code)){kind='Pilares';source='Convenção do projeto: P / PJ + identificação';}
 else if(/^(?:V|VJ|VT)\s*[-._]?\s*\d+[A-Z]?(?:\b|$)/.test(code)){kind='Vigas';source='Convenção do projeto: V + identificação';}
 else if(/^(?:L|LJ)\s*[-._]?\s*\d+[A-Z]?(?:\b|$)/.test(code)){kind='Lajes';source='Convenção do projeto: L + identificação';}
 else if(/^(?:S|SAP|B)\s*[-._]?\s*\d+[A-Z]?(?:\b|$)/.test(code)){kind='Fundações';source='Convenção do projeto: S / SAP / B + identificação · PREMISSA';}
 const planta=qualified('Planta')||get(sets,'Pset_ColumnCommon','Reference')||'';
 return {...element,structuralKind:kind,classificationSource:source,code:String(title),storeyName:element.storeyName||String(planta),levelIndex:qualified('Piso'),levelSource:element.storeyId?'IfcRelContainedInSpatialStructure → IfcBuildingStorey':planta?'TQS_Padrao.Planta':'A_CONFIRMAR',material:qualified('Material')||'',geometryType,informationStatus:'EXTRAIDO_METADATA',conventionStatus:'CONVENÇÃO DO PROJETO · A CONFIRMAR NO BEP'};
}
export function propertyValue(sets,setName,key){return get(sets,setName,key);}
