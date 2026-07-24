/** Signed(presigned) 다운로드 URL 과 만료 시각. */
export interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

/** S3/MinIO 접속 설정. MinIO 는 forcePathStyle=true 가 필요하다. */
export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/** 오브젝트 스토리지 포트. 앱은 이 인터페이스에만 의존한다. */
export interface StorageClient {
  /** 객체를 저장한다. */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** 지정 TTL 동안 유효한 다운로드용 Signed URL 을 만든다. */
  presignGet(key: string, expiresInSeconds: number): Promise<PresignedUrl>;
}
