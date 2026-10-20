import { memoryStore } from "./memoryStore";
import {
  describeFeedbackStoreContract,
  describeStoreContract,
} from "./testing";

describeStoreContract("memoryStore", () => memoryStore());
describeFeedbackStoreContract("memoryStore", () => memoryStore());
