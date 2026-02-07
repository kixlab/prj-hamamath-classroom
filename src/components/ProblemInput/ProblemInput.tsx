import { useState, ChangeEvent, FormEvent } from 'react';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import styles from './ProblemInput.module.css';

interface ProblemInputProps {
  onSubmit?: (data: any) => void;
}

interface FormData {
  problem: string;
  answer: string;
  solution: string;
  grade: string;
  image: File | null;
  imagePreview: string | null;
  imageData: string | null;
  imgDescription: string;
}

export const ProblemInput = ({ onSubmit }: ProblemInputProps) => {
  const { setCurrentCotData, setCurrentStep, setLoading, setError } = useApp();
  const [problemList, setProblemList] = useState<string[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    problem: '',
    answer: '',
    solution: '',
    grade: '',
    image: null,
    imagePreview: null,
    imageData: null,
    imgDescription: '',
  });

  const handleProblemSelect = async (filename: string) => {
    if (!filename) return;

    try {
      const data = await api.getProblem(filename);
      setFormData((prev) => ({
        ...prev,
        problem: data.problem || '',
        answer: data.answer || '',
        solution: data.main_solution || '',
        grade: data.grade || '',
        imageData: data.image_data || null,
        imagePreview: data.image_data || null,
      }));
    } catch (err) {
      console.error('문제 데이터 로드 중 오류:', err);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          image: file,
          imagePreview: base64String,
          imageData: base64String,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      image: null,
      imagePreview: null,
      imageData: null,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const requestData = {
        main_problem: formData.problem,
        main_answer: formData.answer,
        main_solution: formData.solution || null,
        grade: formData.grade,
        image_data: formData.imageData || null,
      };

      const result = await api.createCoT(requestData);
      const cotDataWithExtras = {
        ...result,
        img_description: formData.imgDescription,
        image_data: formData.imageData,
        main_solution: formData.solution,
      };
      
      // 데이터 설정 후 2단계로 이동
      setCurrentCotData(cotDataWithExtras);
      setCurrentStep(2);
      onSubmit?.(cotDataWithExtras);
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.problemInput}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="problemSelect">문제 ID</label>
          <select
            id="problemSelect"
            value={selectedProblem}
            onChange={(e) => {
              setSelectedProblem(e.target.value);
              handleProblemSelect(e.target.value);
            }}
            className={styles.select}
          >
            <option value="">직접 입력하기</option>
            {problemList.map((file) => (
              <option key={file} value={file}>
                {file.replace('.json', '')}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="problem">문제</label>
          <textarea
            id="problem"
            value={formData.problem}
            onChange={(e) => setFormData((prev) => ({ ...prev, problem: e.target.value }))}
            required
            placeholder="수학 문제를 입력하세요"
            className={styles.textarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="answer">정답</label>
          <input
            type="text"
            id="answer"
            value={formData.answer}
            onChange={(e) => setFormData((prev) => ({ ...prev, answer: e.target.value }))}
            placeholder="정답을 입력하세요"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="solution">모범답안</label>
          <textarea
            id="solution"
            value={formData.solution}
            onChange={(e) => setFormData((prev) => ({ ...prev, solution: e.target.value }))}
            placeholder="모범답안을 입력하세요"
            className={styles.textarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="grade">학년</label>
          <input
            type="text"
            id="grade"
            value={formData.grade}
            onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
            placeholder="예: 3학년"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="imageUpload">문제 이미지 업로드</label>
          <input
            type="file"
            id="imageUpload"
            accept="image/*"
            onChange={handleImageUpload}
            className={styles.fileInput}
          />
          {formData.imagePreview && (
            <div className={styles.imagePreview}>
              <img src={formData.imagePreview} alt="이미지 미리보기" />
              <button type="button" onClick={handleRemoveImage} className={styles.removeImageBtn}>
                이미지 제거
              </button>
            </div>
          )}
        </div>

        <button type="submit" className={styles.submitBtn} disabled={!formData.problem || !formData.answer}>
          문제 풀이하기
        </button>
      </form>
    </div>
  );
};
