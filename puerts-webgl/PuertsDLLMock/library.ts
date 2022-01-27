/**
 * 一次函数调用的info
 * 对应v8::FunctionCallbackInfo
 */
export class FunctionCallbackInfo {
    args: any[];
    returnValue: any;

    constructor(args: any[]) {
        this.args = args;
    }

    recycle(): void {
        this.args = null;
        this.returnValue = void 0;
    }
}

/**
 * 把FunctionCallbackInfo以及其参数转化为c#可用的intptr
 */
export class FunctionCallbackInfoPtrManager {
    // FunctionCallbackInfo的列表，以列表的index作为IntPtr的值
    private static infos: FunctionCallbackInfo[] = [new FunctionCallbackInfo([0])] // 这里原本只是个普通的0
    // FunctionCallbackInfo用完后，就可以放入回收列表，以供下次复用
    private static freeInfosIndex: MockIntPtr[] = [];

    /**
     * intptr的格式为id左移四位
     * 
     * 右侧四位就是为了放下参数的序号，用于表示callbackinfo参数的intptr
     */
    static GetMockPointer(args: any[]): MockIntPtr {
        let index: number;
        index = this.freeInfosIndex.pop();
        // index最小为1
        if (index) {
            this.infos[index].args = args;
        } else {
            index = this.infos.push(new FunctionCallbackInfo(args)) - 1;
        }
        return index << 4;
    }

    static GetByMockPointer(intptr: MockIntPtr): FunctionCallbackInfo {
        return this.infos[intptr >> 4];
    }

    static GetReturnValueAndRecycle(intptr: MockIntPtr): any {
        const index = intptr >> 4;
        this.freeInfosIndex.push(index);
        let info = this.infos[index];
        let ret = info.returnValue;
        info.recycle();
        return ret;
    }

    static ReleaseByMockIntPtr(intptr: MockIntPtr) {
        const index = intptr >> 4;
        this.infos[index].recycle();
        this.freeInfosIndex.push(index);
    }

    static GetArgsByMockIntPtr<T>(ptr: MockIntPtr): T {
        const callbackInfoIndex = ptr >> 4;
        const argsIndex = ptr & 15;
        const info: FunctionCallbackInfo = this.infos[callbackInfoIndex];
        return info.args[argsIndex] as T;
    }
}

export class Ref<T> {
    public value: T
}

/**
 * 代表一个JSFunction
 */
export class JSFunction {
    public _func: (...args: any[]) => any;

    public readonly id: number;

    public args: any[] = [];

    public lastExceptionInfo: string = '';

    constructor(func: (...args: any[]) => any) {
        this._func = func;
        this.id = jsFunctionOrObjectFactory.regularID++;
        jsFunctionOrObjectFactory.idMap.set(func, this.id);
        jsFunctionOrObjectFactory.jsFuncOrObjectKV[this.id] = this;
    }
    public invoke() {
        var args = [...this.args];
        this.args.length = 0;
        return this._func.apply(this, args);
    }
}

export class jsFunctionOrObjectFactory {
    public static regularID: number = 1;
    public static idMap = new WeakMap<Function, number>();
    public static jsFuncOrObjectKV: { [id: number]: JSFunction } = {};

    public static getOrCreateJSFunction(funcValue: (...args: any[]) => any) {
        const id = jsFunctionOrObjectFactory.idMap.get(funcValue);
        if (id) {
            return jsFunctionOrObjectFactory.jsFuncOrObjectKV[id];
        }
        return new JSFunction(funcValue);
    }

    public static getJSFunctionById(id: number): JSFunction {
        return jsFunctionOrObjectFactory.jsFuncOrObjectKV[id];
    }

    public static removeJSFunctionById(id: number) {
        const jsFunc = jsFunctionOrObjectFactory.jsFuncOrObjectKV[id];
        jsFunctionOrObjectFactory.idMap.delete(jsFunc._func);
        delete jsFunctionOrObjectFactory.jsFuncOrObjectKV[id];
    }
}

/**
 * CSharp对象记录表，记录所有CSharp对象并分配id
 * 和puerts.dll所做的一样
 */
export class CSharpObjectMap {
    public classes: {
        (): void;
        createFromCS(csID: number): any;
        [key: string]: any;
    }[] = [null];

    private nativeObjectKV: { [objectID: CSIdentifier]: WeakRef<any> } = {};
    private csIDWeakMap: WeakMap<any, CSIdentifier> = new WeakMap();

    public namesToClassesID: { [name: string]: number } = {};
    public classIDWeakMap = new WeakMap();

    add(csID: CSIdentifier, obj: any) {
        this.nativeObjectKV[csID] = new WeakRef(obj);
        this.csIDWeakMap.set(obj, csID);
    }
    remove(csID: CSIdentifier) {
        delete this.nativeObjectKV[csID];
    }
    findOrAddObject(csID: CSIdentifier, classID: number) {
        let ret = this.nativeObjectKV[csID];
        if (ret && (ret = ret.deref())) {
            return ret;
        }
        ret = this.classes[classID].createFromCS(csID);
        // this.add(csID, ret); 构造函数里负责调用
        return ret;
    }
    getCSIdentifierFromObject(obj: any) {
        return this.csIDWeakMap.get(obj);
    }
}

interface Destructor {
    (heldValue: CSIdentifier): any,
    ref: number
};
var destructors: { [csIdentifier: CSIdentifier]: Destructor } = {};

/**
 * JS对象声明周期监听
 */
var registry: FinalizationRegistry<any> = null;
function init() {
    registry = new FinalizationRegistry(function (heldValue: CSIdentifier) {
        var callback = destructors[heldValue];
        if (!callback) {
            throw new Error("cannot find destructor for " + heldValue);
        }
        if (--callback.ref == 0) {
            delete destructors[heldValue];
            callback(heldValue);
        }
    });
}
export function OnFinalize(obj: object, heldValue: any, callback: (heldValue: CSIdentifier) => any) {
    if (!registry) {
        init();
    }
    let originCallback = destructors[heldValue];
    if (originCallback) {
        // WeakRef内容释放时机可能比finalizationRegistry的触发更早，前面如果发现weakRef为空会重新创建对象
        // 但之前对象的finalizationRegistry最终又肯定会触发。
        // 所以如果遇到这个情况，需要给destructor加计数
        ++originCallback.ref;
    } else {
        (callback as Destructor).ref = 1;
        destructors[heldValue] = (callback as Destructor);
    }
    registry.register(obj, heldValue);
}
declare let global: any;
global = global || globalThis || window;
global.global = global;
export { global };

export namespace PuertsJSEngine {
    export interface EngineConstructorParam {
        UTF8ToString: (strPtr: CSString) => string,
        _malloc: (size: number) => number,
        _memset: (ptr: number, ch: number, size: number) => number,
        _memcpy: (dst: number, src: number, size: number) => void,
        _free: (ptr: number) => void,
        stringToUTF8: (str: string, buffer: any, size: number) => any,
        lengthBytesUTF8: (str: string) => number,
        unityInstance: any,
    }
    export interface UnityAPI {
        UTF8ToString: (strPtr: CSString) => string,
        _malloc: (size: number) => number,
        _memset: (ptr: number, ch: number, size: number) => number,
        _memcpy: (dst: number, src: number, size: number) => void,
        _free: (ptr: number) => void,
        stringToUTF8: (str: string, buffer: any, size: number) => any,
        lengthBytesUTF8: (str: string) => number,
        HEAP8: Uint8Array,
        HEAP32: Uint32Array,
        dynCall_viiiii: Function,
        dynCall_viii: Function,
        dynCall_iiiii: Function
    }
}

export class PuertsJSEngine {
    public readonly csharpObjectMap: CSharpObjectMap

    public readonly unityApi: PuertsJSEngine.UnityAPI;

    public lastReturnCSResult: any = null;
    public lastExceptionInfo: string = null;
    public callV8Function: MockIntPtr;
    public callV8Constructor: MockIntPtr;
    public callV8Destructor: MockIntPtr;

    constructor(ctorParam: PuertsJSEngine.EngineConstructorParam) {
        this.csharpObjectMap = new CSharpObjectMap();
        const { UTF8ToString, _malloc, _memset, _memcpy, _free, stringToUTF8, lengthBytesUTF8 } = ctorParam
        this.unityApi = { 
            UTF8ToString, 
            _malloc, 
            _memset, 
            _memcpy, 
            _free, 
            stringToUTF8, 
            lengthBytesUTF8,

            dynCall_iiiii: ctorParam.unityInstance.dynCall_iiiii.bind(ctorParam.unityInstance),
            dynCall_viii: ctorParam.unityInstance.dynCall_viii.bind(ctorParam.unityInstance),
            dynCall_viiiii: ctorParam.unityInstance.dynCall_viiiii.bind(ctorParam.unityInstance),
            HEAP32: null,
            HEAP8: null
        };
        Object.defineProperty(this.unityApi, 'HEAP32', {
            get: function() {
                return ctorParam.unityInstance.HEAP32
            }
        })
        Object.defineProperty(this.unityApi, 'HEAP8', {
            get: function() {
                return ctorParam.unityInstance.HEAP8
            }
        })
    }

    JSStringToCSString(returnStr: string, /** out int */length: number) {
        if (returnStr === null || returnStr === undefined) {
            return 0;
        }
        var bufferSize = this.unityApi.lengthBytesUTF8(returnStr);
        setOutValue32(this, length, bufferSize);
        var buffer = this.unityApi._malloc(bufferSize + 1);
        this.unityApi.stringToUTF8(returnStr, buffer, bufferSize + 1);
        return buffer;
    }

    public generalDestructor: IntPtr
    makeV8FunctionCallbackFunction(functionPtr: IntPtr, data: number) {
        // 不能用箭头函数！返回的函数会放到具体的class上，this有含义。
        const engine = this;
        return function (...args: any[]) {
            let callbackInfoPtr = FunctionCallbackInfoPtrManager.GetMockPointer(args);
            engine.callV8FunctionCallback(
                functionPtr,
                // getIntPtrManager().GetPointerForJSValue(this),
                engine.csharpObjectMap.getCSIdentifierFromObject(this),
                callbackInfoPtr,
                args.length,
                data
            )
            return FunctionCallbackInfoPtrManager.GetReturnValueAndRecycle(callbackInfoPtr);
        }
    }

    callV8FunctionCallback(functionPtr: IntPtr, selfPtr: CSIdentifier, infoIntPtr: MockIntPtr, paramLen: number, data: number) {
        this.unityApi.dynCall_viiiii(this.callV8Function, functionPtr, infoIntPtr, selfPtr, paramLen, data);
    }

    callV8ConstructorCallback(functionPtr: IntPtr, infoIntPtr: MockIntPtr, paramLen: number, data: number) {
        return this.unityApi.dynCall_iiiii(this.callV8Constructor, functionPtr, infoIntPtr, paramLen, data);
    }

    callV8DestructorCallback(functionPtr: IntPtr, selfPtr: CSIdentifier, data: number) {
        this.unityApi.dynCall_viii(this.callV8Destructor, functionPtr, selfPtr, data);
    }
}

export function GetType(engine: PuertsJSEngine, value: any): number {
    if (value === null || value === undefined) { return 1 }
    if (typeof value == 'number') { return 4 }
    if (typeof value == 'string') { return 8 }
    if (typeof value == 'boolean') { return 16 }
    if (typeof value == 'function') { return 256 }
    if (value instanceof Date) { return 512 }
    if (value instanceof Array) { return 128 }
    if (engine.csharpObjectMap.getCSIdentifierFromObject(value)) { return 32 }
    return 64;
}

export function makeBigInt(low: number, high: number) {
    return (BigInt(high >>> 0) << BigInt(32)) + BigInt(low >>> 0)
}

export function setOutValue32(engine: PuertsJSEngine, valuePtr: number, value: any) {
    engine.unityApi.HEAP32[valuePtr >> 2] = value;
}

export function setOutValue8(engine: PuertsJSEngine, valuePtr: number, value: any) {
    engine.unityApi.HEAP8[valuePtr] = value;
}