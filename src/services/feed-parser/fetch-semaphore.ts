import { MAX_CONCURRENT_FETCHES } from "../feed-timeout.js";
import { ConcurrencySemaphore } from "../../utils/concurrency.js";

export const globalFetchSemaphore = new ConcurrencySemaphore(MAX_CONCURRENT_FETCHES);
