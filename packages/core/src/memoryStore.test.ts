import { memoryStore } from "./memoryStore.js";
import {
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
} from "./testing.js";

describeStoreContract("memoryStore", () => memoryStore());
describeFeedbackStoreContract("memoryStore", () => memoryStore());
describeSettingsStoreContract("memoryStore", () => memoryStore());
