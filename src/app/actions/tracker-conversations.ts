"use server";

import { adminDb } from "@/lib/firebase/admin";

export interface TrackerMessage {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: string;
}

export interface TrackerConversation {
  id: string;
  title: string;
  companyId: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageSnippet?: string;
  messages?: TrackerMessage[];
}

export async function listTrackerConversations(companyId: string): Promise<TrackerConversation[]> {
  if (!adminDb || !companyId) return [];

  try {
    const snap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("tracker_conversations")
      .orderBy("updatedAt", "desc")
      .limit(30)
      .get();

    return snap.docs.map(doc => {
      const data = doc.data();
      const messages = (data.messages || []) as TrackerMessage[];
      return {
        id: doc.id,
        title: data.title || "Conversación sin título",
        companyId,
        userId: data.userId || "",
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        messageCount: messages.length,
        lastMessageSnippet: messages.length > 0 ? messages[messages.length - 1].text.slice(0, 100) : ""
      };
    });
  } catch (error) {
    console.error("Error listing tracker conversations:", error);
    return [];
  }
}

export async function getTrackerConversation(companyId: string, conversationId: string): Promise<TrackerConversation | null> {
  if (!adminDb || !companyId || !conversationId) return null;

  try {
    const doc = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("tracker_conversations")
      .doc(conversationId)
      .get();

    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      id: doc.id,
      title: data.title || "Conversación",
      companyId,
      userId: data.userId || "",
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      messageCount: (data.messages || []).length,
      messages: data.messages || []
    };
  } catch (error) {
    console.error("Error getting tracker conversation:", error);
    return null;
  }
}

export async function deleteTrackerConversation(companyId: string, conversationId: string): Promise<{ success: boolean }> {
  if (!adminDb || !companyId || !conversationId) return { success: false };

  try {
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("tracker_conversations")
      .doc(conversationId)
      .delete();

    return { success: true };
  } catch (error) {
    console.error("Error deleting tracker conversation:", error);
    return { success: false };
  }
}
