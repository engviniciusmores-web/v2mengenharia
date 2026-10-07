export function shortId(row:any,index:number):string;
export function displayTree(rows:any[]):{rows:any[];parents:Map<string,string[]>};
export function editActivity(bundle:any,wbs:string,changes:{name:string;start:string;finish:string;predecessor:string;phase:string},cascade?:boolean):any;
export function addActivity(bundle:any,changes:{name:string;start:string;finish:string;predecessor:string;phase:string},afterWbs?:string):any;
export function removeActivity(bundle:any,wbs:string):any;
