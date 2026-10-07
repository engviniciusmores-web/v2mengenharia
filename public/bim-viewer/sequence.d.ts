export type ModelElement={sourceId?:string;sourceName?:string;key?:string;hasGeometry?:boolean;code?:string;structuralKind?:string;classificationSource?:string;description?:string;objectType?:string;tag?:string;levelSource?:string;propertySets?:Array<{name:string;properties:Array<{name:string;value:unknown}>}>;id:number;globalId:string;type:string;name:string;storeyId?:number;storeyName?:string;elevation?:number;loadBearing?:boolean};
export type Inventory={federationId?:string;complete?:boolean;models?:Array<{name:string;schema?:string;geometry_processed:number;elements_in_model:number}>;name:string;signature:string;schema?:string;elements:ModelElement[]};
export const defaultSequenceOptions:{start:string;workdays:boolean;foundationDays:number;columnDays:number;beamDays:number;slabDays:number;otherDays:number;releaseDays:number};
export function generateSequence(inventory:Inventory,options?:Partial<typeof defaultSequenceOptions>):any;
export function editSequenceDate(bundle:any,wbs:string,start:string,finish:string):any;
export function finishDate(start:string,duration:number,workdays?:boolean):string;
export function reschedule(bundle:any,wbs:string,start:string,finish:string,cascade?:boolean):any;
