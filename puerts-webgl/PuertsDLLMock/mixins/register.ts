import { FunctionCallbackInfoPtrManager, global, OnFinalize, PuertsJSEngine } from "../library";
/**
 * mixin
 * 注册类API，如注册全局函数、注册类，以及类的属性方法等
 * 
 * @param engine 
 * @returns 
 */
export default function WebGLBackendRegisterAPI(engine: PuertsJSEngine) {
    const returnee = {
        SetGlobalFunction: function (isolate: IntPtr, nameString: CSString, v8FunctionCallback: IntPtr, /*long */dataLow: any) {
            const name = engine.unityApi.Pointer_stringify(nameString);
            global[name] = engine.makeV8FunctionCallbackFunction(v8FunctionCallback, dataLow);
        },
        _RegisterClass: function (isolate: IntPtr, BaseTypeId: int, fullNameString: CSString, constructor: IntPtr, destructor: IntPtr, /*long */dataLow: number) {
            const fullName = engine.unityApi.Pointer_stringify(fullNameString);
            const csharpObjectMap = engine.csharpObjectMap;
            const id = csharpObjectMap.classes.length;

            let tempExternalCSObjectID = 0;
            const ctor = function () {
                // 设置类型ID
                this["$cid"] = id;
                // nativeObject的构造函数
                // 构造函数有两个调用的地方：1. js侧new一个它的时候 2. cs侧创建了一个对象要传到js侧时
                // 第一个情况，cs对象ID是callV8ConstructorCallback返回的。
                // 第二个情况，则cs对象ID是cs new完之后一并传给js的。
                
                let csObjectID = tempExternalCSObjectID; // 如果是第二个情况，此ID由createFromCS设置
                tempExternalCSObjectID = 0;
                if (csObjectID === 0) {
                    const args = Array.prototype.slice.call(arguments, 0);
                    const callbackInfoPtr = FunctionCallbackInfoPtrManager.GetMockPointer(args);
    
                    // 虽然puerts内Constructor的返回值叫self，但它其实就是CS对象的一个id而已。
                    csObjectID = engine.callV8ConstructorCallback(constructor, callbackInfoPtr, args.length, dataLow);
                    FunctionCallbackInfoPtrManager.ReleaseByMockIntPtr(callbackInfoPtr);
                }
                csharpObjectMap.add(csObjectID, this);

                OnFinalize(this, csObjectID, (csObjectID)=> {
                    engine.callV8DestructorCallback(destructor || engine.generalDestructor, csObjectID, dataLow);
                })

            }
            ctor.createFromCS = function(csObjectID: number) { 
                tempExternalCSObjectID = csObjectID;
                return new (ctor as any)() 
            };
            Object.defineProperty(ctor, "name", { value: fullName + "Constructor" });
            Object.defineProperty(ctor, "$cid", { value: id });
            csharpObjectMap.classes.push(ctor);
            csharpObjectMap.classIDWeakMap.set(ctor, id);

            if (BaseTypeId > 0) {
                ctor.prototype.__proto__ = csharpObjectMap.classes[BaseTypeId].prototype
            }
            csharpObjectMap.namesToClassesID[fullName] = id;

            return id;
        },
        RegisterStruct: function (isolate: IntPtr, BaseTypeId: int, fullNameString: CSString, constructor: IntPtr, destructor: IntPtr, /*long */dataLow: number, size: int) {
            return returnee._RegisterClass(isolate, BaseTypeId, fullNameString, constructor, destructor, dataLow);
        },
        RegisterFunction: function (isolate: IntPtr, classID: int, nameString: CSString, isStatic: bool, callback: IntPtr, /*long */data: number) {
            var cls = engine.csharpObjectMap.classes[classID]
            if (!cls) {
                return false;
            }
            const name = engine.unityApi.Pointer_stringify(nameString);

            var fn = engine.makeV8FunctionCallbackFunction(callback, data)
            if (isStatic) {
                cls[name] = fn
            } else {
                cls.prototype[name] = fn
            }
        },
        RegisterProperty: function (
            isolate: IntPtr, 
            classID: int, 
            nameString: CSString, 
            isStatic: bool, 
            getter: IntPtr, 
            /*long */getterDataLow: number, 
            /*long */getterDataHigh: number, 
            setter: IntPtr, 
            /*long */setterDataLow: number, 
            /*long */setterDataHigh: number, 
            dontDelete: bool
        ) {
            var cls = engine.csharpObjectMap.classes[classID]
            if (!cls) {
                return false;
            }
            const name = engine.unityApi.Pointer_stringify(nameString);

            var attr: PropertyDescriptor = {
                configurable: !dontDelete,
                enumerable: false
            };
            attr.get = engine.makeV8FunctionCallbackFunction(getter, getterDataLow);
            if (setter) {
                attr.set = engine.makeV8FunctionCallbackFunction(setter, setterDataLow);
            }

            if (isStatic) {
                Object.defineProperty(cls, name, attr)
            } else {
                Object.defineProperty(cls.prototype, name, attr)
            }
        },
    }

    return returnee;
}