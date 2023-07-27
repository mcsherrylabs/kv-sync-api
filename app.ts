// app.ts

import { WebSocketModule } from './ws-module';
import { DataVault, MemoryKeyData, UpdateResult, syncData } from "./data-vault";
import { base64ToUint8Array } from './encrypt';


// app.ts

// Generate random values and fill the array with them

const keys = {
    pair: { 
        publicKey: base64ToUint8Array("ZBvQZ7DrhSsPOGax3/2IX1qeiPATyAcGPN6Q8Nj3QGE="),
        privateKey: base64ToUint8Array("kInP/uWkjoGCUtZaSOXOyvzPS+uz9TkvRSlxaw3qFVw=") 
    },
    nodeId: "pally",
    tag: "dvTag"
}

type MyTuple = [string, Promise<UpdateResult>][];


function printValues(myPromises: Promise<MyTuple>) {
    myPromises
      .then((arr) => {
        return Promise.all(
          arr.map(([str, innerPromise]) => {
            return innerPromise.then((updateResult) => {
              console.log(`Key: ${str}, UpdateResult:`, updateResult);
            });
          })
        );
      })
      .then(() => {
        console.log("All values printed.");
      })
      .catch((error) => {
        console.error("An error occurred:", error);
      });
  }

const map1 = new Map();
map1.set("key1", { value: "value1", version: 0 });
map1.set("key3", { value: "value3", version: 0 });
map1.set("key4", { value: "value4", version: 0 });

const dummy = new MemoryKeyData(map1);

const websocketUrl = 'ws://localhost:8686/datavault'; // Replace this with the actual WebSocket URL

const websocketModule = new WebSocketModule(websocketUrl, () => test())

const dv = new DataVault(keys.pair, keys.nodeId, keys.tag, websocketModule);


function test() {
    console.log("Begin!")
    //printValues2("dv", dv.keys())
    //printValues2("dummy", dummy.keys())
    //printValues2("dv2", dv.keys())
    const data = syncData(dummy, dv)
  
    
    printValues(data)
}


