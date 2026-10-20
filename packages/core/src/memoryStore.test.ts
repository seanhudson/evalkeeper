import { memoryStore } from "./memoryStore";
import { describeStoreContract } from "./testing";

describeStoreContract("memoryStore", () => memoryStore());
