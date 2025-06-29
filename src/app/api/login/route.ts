import { prisma } from "@/libs/prisma";
import { loginRequestSchema } from "@/app/_types/LoginRequest";
import { userProfileSchema } from "@/app/_types/UserProfile";
import type { UserProfile } from "@/app/_types/UserProfile";
import type { ApiResponse } from "@/app/_types/ApiResponse";
import { NextResponse, NextRequest } from "next/server";
import { createSession } from "@/app/api/_helper/createSession";
import { createJwt } from "@/app/api/_helper/createJwt";
import { AUTH } from "@/config/auth";
import bcrypt from "bcrypt";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

// キャッシュを無効化して毎回最新情報を取得
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const POST = async (req: NextRequest) => {
  try {
    const result = loginRequestSchema.safeParse(await req.json());
    if (!result.success) {
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: "リクエストボディの形式が不正です。",
      };
      return NextResponse.json(res);
    }
    const loginRequest = result.data;

    const user = await prisma.user.findUnique({
      where: { email: loginRequest.email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        aboutSlug: true,
        aboutContent: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        isLocked: true,
        lockUntil: true,
      },
    });
    if (!user) {
      // 💀 このアカウント（メールアドレス）の有効無効が分かってしまう。
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: "このメールアドレスは登録されていません。",
        // message: "メールアドレスまたはパスワードの組み合わせが正しくありません。",
      };
      return NextResponse.json(res);
    }

    // アカウントロック判定
    if (user.isLocked && user.lockUntil && user.lockUntil > new Date()) {
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: `アカウントがロックされています。${user.lockUntil.toLocaleString()}までログインできません。`,
      };
      return NextResponse.json(res);
    }

    // パスワードの検証
    const isValidPassword = await bcrypt.compare(loginRequest.password, user.password);
    if (!isValidPassword) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      let isLocked = false;
      let lockUntil = null;
      if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        isLocked = true;
        lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts,
          isLocked,
          lockUntil,
        },
      });
      const res: ApiResponse<null> = {
        success: false,
        payload: null,
        message: isLocked
          ? lockUntil
            ? `アカウントがロックされました。${lockUntil.toLocaleString()}までログインできません。`
            : "アカウントがロックされました。"
          : "メールアドレスまたはパスワードの組み合わせが正しくありません。",
      };
      return NextResponse.json(res);
    }

    // 成功時はリセット
    if (user.failedLoginAttempts > 0 || user.isLocked) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          isLocked: false,
          lockUntil: null,
        },
      });
    }

    const tokenMaxAgeSeconds = 60 * 60 * 3; // 3時間

    if (AUTH.isSession) {
      // ■■ セッションベース認証の処理 ■■
      await createSession(user.id, tokenMaxAgeSeconds);
      const res: ApiResponse<UserProfile> = {
        success: true,
        payload: userProfileSchema.parse(user), // 余分なプロパティを削除
        message: "",
      };
      return NextResponse.json(res);
    } else {
      // ■■ トークンベース認証の処理 ■■
      const jwt = await createJwt(user, tokenMaxAgeSeconds);
      const res: ApiResponse<string> = {
        success: true,
        payload: jwt,
        message: "",
      };
      return NextResponse.json(res);
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Internal Server Error";
    console.error(errorMsg);
    const res: ApiResponse<null> = {
      success: false,
      payload: null,
      message: "ログインのサーバサイドの処理に失敗しました。",
    };
    return NextResponse.json(res);
  }
};
