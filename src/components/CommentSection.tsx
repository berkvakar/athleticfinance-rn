import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Comment {
  comment_id: string;
  article_id: string;
  user_id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  author: {
    username: string;
    name?: string;
    avatar?: string;
  };
}

interface CommentSectionProps {
  articleId: number;
}

export default function CommentSection({ articleId }: CommentSectionProps) {
  const { user } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      return 'Unknown date';
    }
  };

  // Fetch comments from API
  const fetchComments = useCallback(async () => {
    try {
      setError(null);
      const response = await apiClient.getArticleComments(articleId, {
        limit: 100,
        sort: 'desc',
      });

      if (response.success && response.comments) {
        setComments(response.comments);
      } else {
        setError(response.error || 'Failed to load comments');
        setComments([]);
      }
    } catch (err: any) {
      logger.error('[CommentSection] Error fetching comments:', err);
      setError('Failed to load comments. Please try again.');
      setComments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [articleId]);

  // Load comments on mount
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Handle posting a new comment
  const handlePostComment = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to post a comment.');
      return;
    }

    const trimmedContent = commentText.trim();
    if (trimmedContent.length === 0) {
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const response = await apiClient.createComment(articleId, trimmedContent);

      if (response.success && response.comment) {
        // Add new comment to the top of the list
        setComments((prev) => [response.comment!, ...prev]);
        setCommentText('');
      } else {
        Alert.alert('Error', response.error || 'Failed to post comment. Please try again.');
      }
    } catch (err: any) {
      logger.error('[CommentSection] Error posting comment:', err);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  // Handle starting edit
  const handleStartEdit = (comment: Comment) => {
    setEditingCommentId(comment.comment_id);
    setEditText(comment.content);
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText('');
  };

  // Handle saving edit
  const handleSaveEdit = async () => {
    if (!editingCommentId) return;

    const trimmedContent = editText.trim();
    if (trimmedContent.length === 0) {
      Alert.alert('Error', 'Comment cannot be empty.');
      return;
    }

    try {
      const response = await apiClient.updateComment(editingCommentId, trimmedContent);

      if (response.success && response.comment) {
        // Update comment in the list
        setComments((prev) =>
          prev.map((c) =>
            c.comment_id === editingCommentId ? response.comment! : c
          )
        );
        setEditingCommentId(null);
        setEditText('');
      } else {
        Alert.alert('Error', response.error || 'Failed to update comment. Please try again.');
      }
    } catch (err: any) {
      logger.error('[CommentSection] Error updating comment:', err);
      Alert.alert('Error', 'Failed to update comment. Please try again.');
    }
  };

  // Handle deleting a comment
  const handleDeleteComment = (commentId: string) => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.deleteComment(commentId);

              if (response.success) {
                // Remove comment from list
                setComments((prev) => prev.filter((c) => c.comment_id !== commentId));
              } else {
                Alert.alert('Error', response.error || 'Failed to delete comment. Please try again.');
              }
            } catch (err: any) {
              logger.error('[CommentSection] Error deleting comment:', err);
              Alert.alert('Error', 'Failed to delete comment. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchComments();
  };

  // Get author display name
  const getAuthorName = (comment: Comment) => {
    return comment.author.name || comment.author.username || 'Anonymous';
  };

  // Get author initial for avatar
  const getAuthorInitial = (comment: Comment) => {
    const name = getAuthorName(comment);
    return name.charAt(0).toUpperCase();
  };

  // Check if user owns comment
  const isCommentOwner = (comment: Comment) => {
    if (!user) return false;
    return comment.user_id === user.id;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading comments...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comments</Text>
            <Text style={styles.commentCount}>
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </Text>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchComments}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Comments List */}
          <View style={styles.commentsList}>
            {comments.length > 0 ? (
              comments.map((comment) => {
                const isOwner = isCommentOwner(comment);
                const isEditing = editingCommentId === comment.comment_id;

                return (
                  <View key={comment.comment_id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <View style={styles.avatar}>
                        {comment.author.avatar ? (
                          <Text style={styles.avatarText}>IMG</Text>
                        ) : (
                          <Text style={styles.avatarText}>
                            {getAuthorInitial(comment)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentAuthor}>
                          {getAuthorName(comment)}
                        </Text>
                        <Text style={styles.commentDate}>
                          {formatDate(comment.createdAt)}
                        </Text>
                      </View>
                      {isOwner && !isEditing && (
                        <View style={styles.commentActions}>
                          <TouchableOpacity
                            onPress={() => handleStartEdit(comment)}
                            style={styles.actionButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <MaterialIcons name="edit" size={18} color="#666" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(comment.comment_id)}
                            style={styles.actionButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <MaterialIcons name="delete" size={18} color="#666" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {isEditing ? (
                      <View style={styles.editContainer}>
                        <TextInput
                          style={styles.editInput}
                          value={editText}
                          onChangeText={setEditText}
                          multiline
                          maxLength={500}
                          autoFocus
                        />
                        <View style={styles.editActions}>
                          <Text style={styles.charCount}>
                            {editText.length}/500
                          </Text>
                          <View style={styles.editButtons}>
                            <TouchableOpacity
                              onPress={handleCancelEdit}
                              style={styles.cancelButton}
                            >
                              <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleSaveEdit}
                              style={[
                                styles.saveButton,
                                editText.trim().length === 0 && styles.saveButtonDisabled,
                              ]}
                              disabled={editText.trim().length === 0}
                            >
                              <Text
                                style={[
                                  styles.saveButtonText,
                                  editText.trim().length === 0 && styles.saveButtonTextDisabled,
                                ]}
                              >
                                Save
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.commentContent}>{comment.content}</Text>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="comment" size={48} color="#999" />
                <Text style={styles.emptyStateText}>No comments yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  {user ? 'Be the first to share your thoughts' : 'Sign in to leave a comment'}
                </Text>
              </View>
            )}
          </View>

          {/* Post Comment Form */}
          {user ? (
            <View style={styles.postCommentSection}>
              <Text style={styles.postCommentTitle}>Add a comment</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Write your comment..."
                  placeholderTextColor="#999"
                  multiline
                  value={commentText}
                  onChangeText={setCommentText}
                  maxLength={500}
                  editable={!posting}
                />
                <View style={styles.inputFooter}>
                  <Text style={styles.charCount}>
                    {commentText.length}/500
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.postButton,
                      (commentText.trim().length === 0 || posting) && styles.postButtonDisabled,
                    ]}
                    onPress={handlePostComment}
                    disabled={commentText.trim().length === 0 || posting}
                  >
                    {posting ? (
                      <ActivityIndicator size="small" color="#9CA3AF" />
                    ) : (
                      <Text
                        style={[
                          styles.postButtonText,
                          commentText.trim().length === 0 && styles.postButtonTextDisabled,
                        ]}
                      >
                        Post
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.postCommentSection}>
              <View style={styles.signInPrompt}>
                <MaterialIcons name="lock" size={24} color="#999" />
                <Text style={styles.signInText}>Sign in to leave a comment</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  commentCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  commentsList: {
    marginBottom: 32,
  },
  commentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  commentMeta: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  commentDate: {
    fontSize: 12,
    color: '#999',
  },
  commentContent: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
  postCommentSection: {
    marginTop: 8,
  },
  postCommentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  inputContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  input: {
    minHeight: 100,
    fontSize: 15,
    color: '#000',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
  },
  postButton: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  postButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  postButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postButtonTextDisabled: {
    color: '#9CA3AF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    flex: 1,
  },
  retryText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  editContainer: {
    marginTop: 8,
  },
  editInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    fontSize: 15,
    color: '#000',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 8,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  saveButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#9CA3AF',
  },
  signInPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 8,
  },
  signInText: {
    fontSize: 14,
    color: '#666',
  },
});

