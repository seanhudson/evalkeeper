import { memoryStore } from "./memoryStore";
import {
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
} from "./testing";

describeStoreContract("memoryStore", () => memoryStore());
describeFeedbackStoreContract("memoryStore", () => memoryStore());
describeSettingsStoreContract("memoryStore", () => memoryStore());
